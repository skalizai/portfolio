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
});

afterAll(async () => {
  await db().$disconnect();
  await server.stop();
  await pg.close();
});

beforeEach(async () => {
  await pg.exec('TRUNCATE "household"."FamilyDocument", "household"."FamilyMember", "household"."Remittance", "household"."EmployeeAllowance", "household"."Employee", "household"."HouseholdAuditLog" CASCADE');
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

  it("children become recipients, you don't, and only one entry can be you", async () => {
    ok(await family.createFamilyMember(member({ fullName: "Sohail Khan", relationship: "SELF" })));
    expect(await family.createFamilyMember(member({ fullName: "Someone", relationship: "SELF" }))).toMatchObject({ ok: false, status: 409 });
    const son = ok(await family.createFamilyMember(member({ fullName: "Ahmad Alizai", relationship: "SON", dateOfBirth: "2015-03-10" })));
    ok(await family.createFamilyMember(member()));
    expect(await recipientNames()).toEqual(["Sana Alizai (WIFE)", "Ahmad Alizai (CHILD)"]);

    // Removing him hides the recipient but keeps what was sent.
    const recipientId = (await db().recipient.findUniqueOrThrow({ where: { familyMemberId: son.id } })).id;
    await remittances.createRemittance(remittances.RemittanceInputSchema.parse({ date: "2026-11-02", recipientId, amountAed: "300", rate: "76" }));
    ok(await family.removeFamilyMember(son.id));
    expect(await recipientNames()).toEqual(["Sana Alizai (WIFE)"]);
    expect(await db().remittance.count({ where: { recipientId } })).toBe(1);
    expect((await family.listFamily()).map((m) => m.relationship)).toEqual(["SELF", "WIFE"]);
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
