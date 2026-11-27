import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PORT = 5552;

let server: PGLiteSocketServer;
let pg: PGlite;
let db: typeof import("@/lib/db").db;
let family: typeof import("@/lib/household/family");
let employees: typeof import("@/lib/household/employees");
let remittances: typeof import("@/lib/household/remittances");
let linked: typeof import("@/lib/household/linked-recipients");
let banks: typeof import("@/lib/household/bank-accounts");

beforeAll(async () => {
  pg = await PGlite.create();
  const dirs = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) await pg.exec(readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8"));
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;
  ({ db } = await import("@/lib/db"));
  family = await import("@/lib/household/family");
  employees = await import("@/lib/household/employees");
  remittances = await import("@/lib/household/remittances");
  linked = await import("@/lib/household/linked-recipients");
  banks = await import("@/lib/household/bank-accounts");
});

afterAll(async () => {
  await db().$disconnect();
  await server.stop();
  await pg.close();
});

beforeEach(async () => {
  await pg.exec('TRUNCATE "household"."BankAccount", "household"."TransferChannel", "household"."FamilyDocument", "household"."FamilyMember", "household"."Remittance", "household"."EmployeeAllowance", "household"."Employee", "household"."HouseholdAuditLog" CASCADE');
  await pg.exec(`DELETE FROM "household"."Recipient"`);
  await pg.exec(`INSERT INTO "household"."Recipient" ("id", "name", "relationship") VALUES ('recipient-wife', 'Wife', 'WIFE')`);
});

const member = (overrides: Record<string, string> = {}) => family.FamilyMemberInputSchema.parse({ fullName: "Sana Alizai", relationship: "WIFE", ...overrides });
const ok = <T extends { ok: boolean }>(result: T) => {
  expect(result.ok).toBe(true);
  return result as Extract<T, { ok: true }>;
};
const recipientNames = async () => (await remittances.listRecipients()).map((r) => `${r.name} (${r.relationship})`);

describe("family members", () => {
  it("tidies document numbers and refuses bad ones", () => {
    const parsed = member({ cnicNo: "3520212345671", passportNo: "ab 1234567", emiratesIdNo: "784199012345671", email: "" });
    expect(parsed).toMatchObject({ cnicNo: "35202-1234567-1", passportNo: "AB1234567", emiratesIdNo: "784-1990-1234567-1" });
    expect(family.FamilyMemberInputSchema.safeParse({ fullName: "A", relationship: "SON", cnicNo: "123" }).success).toBe(false);
    expect(family.FamilyMemberInputSchema.safeParse({ fullName: "A", relationship: "NEPHEW" }).success).toBe(false);
    expect(family.FamilyMemberInputSchema.safeParse({ fullName: "A", relationship: "SELF", passportIssued: "2025-01-01", passportExpiry: "2024-01-01" }).success).toBe(false);
  });

  it("your wife takes over the existing Wife recipient, so earlier transfers stay with her", async () => {
    await remittances.createRemittance(remittances.RemittanceInputSchema.parse({ date: "2026-11-02", recipientId: "recipient-wife", amountAed: "2000", rate: "76" }));
    const wife = ok(await family.createFamilyMember(member()));
    const linked = await db().recipient.findUniqueOrThrow({ where: { familyMemberId: wife.id }, include: { remittances: true } });
    expect(linked).toMatchObject({ id: "recipient-wife", name: "Sana Alizai" });
    expect(linked.remittances).toHaveLength(1);

    ok(await family.updateFamilyMember(wife.id, member({ fullName: "Sana Sohail" })));
    expect(await recipientNames()).toEqual(["Sana Sohail (WIFE)"]);
  });

  it("you and your wife become recipients, children don't, and only one entry can be you", async () => {
    ok(await family.createFamilyMember(member({ fullName: "Sohail Khan", relationship: "SELF" })));
    expect(await family.createFamilyMember(member({ fullName: "Someone", relationship: "SELF" }))).toMatchObject({ ok: false, status: 409 });
    const son = ok(await family.createFamilyMember(member({ fullName: "Ahmad Alizai", relationship: "SON", dateOfBirth: "2015-03-10" })));
    ok(await family.createFamilyMember(member()));
    expect((await recipientNames()).sort()).toEqual(["Sana Alizai (WIFE)", "Sohail Khan (me) (OTHER)"]);

    // A child's recipient from before is hidden, with what was sent to them kept.
    const old = await db().recipient.create({ data: { name: "Ahmad Alizai", relationship: "CHILD", familyMemberId: son.id } });
    await remittances.createRemittance(remittances.RemittanceInputSchema.parse({ date: "2026-11-02", recipientId: old.id, amountAed: "300", rate: "76" }));
    await linked.syncLinkedRecipients();
    expect(await recipientNames()).not.toContain("Ahmad Alizai (CHILD)");
    expect(await db().remittance.count({ where: { recipientId: old.id } })).toBe(1);

    // Removing someone hides their recipient but keeps what was sent.
    const mother = ok(await family.createFamilyMember(member({ fullName: "Bibi Jan", relationship: "MOTHER" })));
    const recipientId = (await db().recipient.findUniqueOrThrow({ where: { familyMemberId: mother.id } })).id;
    await remittances.createRemittance(remittances.RemittanceInputSchema.parse({ date: "2026-11-03", recipientId, amountAed: "500", rate: "76" }));
    ok(await family.removeFamilyMember(mother.id));
    expect(await recipientNames()).not.toContain("Bibi Jan (MOTHER)");
    expect(await db().remittance.count({ where: { recipientId } })).toBe(1);
    expect((await family.listFamily()).map((m) => m.relationship)).toEqual(["SELF", "WIFE", "SON"]);
  });

  it("staff appear as recipients until they leave, and linked recipients keep their names", async () => {
    const maid = await employees.createEmployee(employees.EmployeeInputSchema.parse({ fullName: "Kaniza Masi", role: "Maid", joiningDate: "2024-01-01", basicSalary: "30000", iban: "" }));
    const linked = await db().recipient.findUniqueOrThrow({ where: { employeeId: maid.id } });
    expect(linked).toMatchObject({ name: "Kaniza Masi", relationship: "EMPLOYEE" });
    expect(remittances.groupOf(linked)).toBe("staff");

    ok(await remittances.updateRecipient(linked.id, remittances.RecipientInputSchema.parse({ name: "Renamed", relationship: "OTHER", city: "Lahore" })));
    expect(await db().recipient.findUniqueOrThrow({ where: { id: linked.id } })).toMatchObject({ name: "Kaniza Masi", relationship: "EMPLOYEE", city: "Lahore" });
    expect(await remittances.removeRecipient(linked.id)).toMatchObject({ ok: false, status: 409 });

    await employees.updateEmployee(maid.id, employees.EmployeeInputSchema.parse({ fullName: "Kaniza Masi", role: "Maid", joiningDate: "2024-01-01", basicSalary: "30000", iban: "", status: "LEFT" }));
    expect(await recipientNames()).toEqual(["Wife (WIFE)"]);
  });
});

describe("birthdays, ages and renewals", () => {
  const today = new Date("2026-11-26T00:00:00Z");

  it("works out ages and the days to the next birthday", () => {
    expect(family.ageOn(new Date("2015-11-27"), today)).toBe(10);
    expect(family.ageOn(new Date("2015-11-26"), today)).toBe(11);
    expect(family.daysToBirthday(new Date("2015-11-26"), today)).toBe(0);
    expect(family.daysToBirthday(new Date("2015-11-25"), today)).toBe(364);
    // Born on 29 February: 28 February in a year that isn't a leap year.
    expect(family.daysToBirthday(new Date("2016-02-29"), today)).toBe(94);
    expect(family.daysToBirthday(null, today)).toBeNull();
  });

  it("flags passports six months ahead and other documents within the alert window", () => {
    const base = { id: "m1", fullName: "Sana", relationship: "WIFE", cnicExpiry: null, passportExpiry: null, emiratesIdExpiry: null, visaExpiry: null };
    const alerts = family.familyExpiries(
      [
        { ...base, passportExpiry: new Date("2027-04-01") },
        { ...base, id: "me", fullName: "Sohail", relationship: "SELF", emiratesIdExpiry: new Date("2026-11-20"), cnicExpiry: new Date("2027-04-01") },
      ],
      60,
      today,
    );
    expect(alerts.map((a) => `${a.name} ${a.document} ${family.whenText(a.daysLeft)}`)).toEqual(["Your Emirates ID expired 6 days ago", "Sana's passport expires in 126 days"]);
  });
});

describe("bank accounts and channels", () => {
  const account = (overrides: Record<string, unknown> = {}) => banks.BankAccountInputSchema.parse({ bankName: "HBL", accountTitle: "Sana Alizai", branch: "Gulberg", ...overrides });

  it("the first account is the main one, another can take over, and removing the main one passes it on", async () => {
    expect(banks.BankAccountInputSchema.safeParse({ bankName: " ", branch: "Gulberg" }).success).toBe(false);
    expect(banks.accountLabel({ bankName: "UBL", branch: "", accountTitle: "Sohail" })).toBe("UBL · Sohail");
    const wife = ok(await family.createFamilyMember(member()));
    const first = ok(await banks.addBankAccount(wife.id, account()));
    const second = ok(await banks.addBankAccount(wife.id, account({ bankName: "Meezan", branch: "DHA", isPrimary: "on" })));
    expect((await banks.listBankAccounts(wife.id)).map((a) => [banks.accountLabel(a), a.isPrimary])).toEqual([["Meezan · DHA", true], ["HBL · Gulberg", false]]);
    ok(await banks.removeBankAccount(second.id));
    expect((await banks.listBankAccounts(wife.id)).map((a) => [a.id, a.isPrimary])).toEqual([[first.id, true]]);
    expect(await banks.addBankAccount("nobody", account())).toMatchObject({ ok: false, status: 404 });
  });

  it("a transfer can go to one of the recipient's own accounts, and no one else's", async () => {
    const wife = ok(await family.createFamilyMember(member()));
    const me = ok(await family.createFamilyMember(member({ fullName: "Sohail Khan", relationship: "SELF" })));
    const hers = ok(await banks.addBankAccount(wife.id, account()));
    const mine = ok(await banks.addBankAccount(me.id, account({ bankName: "UBL" })));
    const byRecipient = await banks.accountsByRecipient();
    const wifeRecipient = (await db().recipient.findUniqueOrThrow({ where: { familyMemberId: wife.id } })).id;
    expect(byRecipient[wifeRecipient]).toEqual([{ id: hers.id, label: "HBL · Gulberg" }]);

    const transfer = (bankAccountId: string) => remittances.RemittanceInputSchema.parse({ date: "2026-11-02", recipientId: wifeRecipient, amountAed: "1000", rate: "75", bankAccountId, channel: "Al Ansari Exchange" });
    expect(await remittances.createRemittance(transfer(mine.id))).toMatchObject({ ok: false, status: 400 });
    const sent = ok(await remittances.createRemittance(transfer(hers.id)));
    const row = (await remittances.listRemittances()).find((r) => r.id === sent.id)!;
    expect(row.bankAccount).toMatchObject({ bankName: "HBL" });
    expect(row.feeAed.toString()).toBe("0");
  });

  it("channels are added once each and removed without touching past transfers", async () => {
    ok(await banks.addChannel("Al Ansari Exchange"));
    expect(await banks.addChannel("al ansari exchange")).toMatchObject({ ok: false, status: 409 });
    const bank = ok(await banks.addChannel("Meezan app"));
    expect((await banks.listChannels()).map((ch) => ch.name)).toEqual(["Al Ansari Exchange", "Meezan app"]);
    ok(await banks.removeChannel(bank.id));
    expect((await banks.listChannels()).map((ch) => ch.name)).toEqual(["Al Ansari Exchange"]);
  });
});
