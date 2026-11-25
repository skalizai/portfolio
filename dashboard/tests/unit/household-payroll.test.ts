import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PORT = 5550;

let server: PGLiteSocketServer;
let pg: PGlite;
let db: typeof import("@/lib/db").db;
let payroll: typeof import("@/lib/household/payroll");
let advances: typeof import("@/lib/household/advances");

async function addEmployee(name: string, basic: string, status: "ACTIVE" | "ON_LEAVE" | "LEFT" = "ACTIVE") {
  return db().employee.create({ data: { fullName: name, role: "Maid", joiningDate: new Date("2024-01-01T00:00:00Z"), basicSalary: basic, status, allowances: { create: [{ name: "Food", amount: "3000" }] } } });
}

beforeAll(async () => {
  pg = await PGlite.create();
  const dirs = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) await pg.exec(readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8"));
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;
  ({ db } = await import("@/lib/db"));
  payroll = await import("@/lib/household/payroll");
  advances = await import("@/lib/household/advances");
});

afterAll(async () => {
  await db().$disconnect();
  await server.stop();
  await pg.close();
});

beforeEach(async () => {
  await pg.exec('TRUNCATE "household"."Payslip", "household"."PayrollLine", "household"."PayrollRun", "household"."AdvanceInstallment", "household"."Advance", "household"."EmployeeAllowance", "household"."Employee", "household"."HouseholdAuditLog" CASCADE');
});

describe("payroll runs", () => {
  it("prepares active staff with allowances and this month's advance installment deducted", async () => {
    const shazia = await addEmployee("Shazia", "35000");
    await addEmployee("Aslam", "40000", "ON_LEAVE");
    await addEmployee("Gone", "30000", "LEFT");
    const advance = await advances.createAdvance({ employeeId: shazia.id, date: "2026-11-05", amount: "20000", reason: "Medical", plan: "FIXED_MONTHLY", perMonth: "5000" });
    expect(advance.ok).toBe(true);

    const run = await payroll.prepareRun("2026-11");
    expect(run.ok).toBe(true);
    const prepared = (await payroll.getRun("2026-11"))!;
    expect(prepared.lines.map((l) => l.employee.fullName)).toEqual(["Aslam", "Shazia"]);
    const line = prepared.lines.find((l) => l.employee.fullName === "Shazia")!;
    expect(line.gross.toFixed(2)).toBe("38000.00");
    expect(line.totalDeductions.toFixed(2)).toBe("5000.00");
    expect(line.net.toFixed(2)).toBe("33000.00");
    expect(prepared.totalNet.toFixed(2)).toBe("76000.00");
  });

  it("allows only one run per month", async () => {
    await addEmployee("Shazia", "35000");
    expect((await payroll.prepareRun("2026-11")).ok).toBe(true);
    expect(await payroll.prepareRun("2026-11")).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("already exists") });
    expect(await payroll.prepareRun("2026-13")).toMatchObject({ ok: false, status: 400 });
  });

  it("works out unpaid leave and extra lines, and recomputes the totals", async () => {
    await addEmployee("Shazia", "36000");
    await payroll.prepareRun("2026-11");
    const line = (await payroll.getRun("2026-11"))!.lines[0]!;
    const saved = await payroll.updateLine(line.id, {
      earnings: [{ kind: "EID_GIFT", label: "Eid gift", amount: "5000" }],
      unpaidDays: "2",
      otherDeductions: [{ label: "Phone bill", amount: "800" }],
    });
    expect(saved.ok).toBe(true);
    const run = (await payroll.getRun("2026-11"))!;
    // 36,000 + 3,000 + 5,000 = 44,000; unpaid 2 x 1,200 = 2,400; plus 800.
    expect(run.lines[0]!.gross.toFixed(2)).toBe("44000.00");
    expect(run.lines[0]!.totalDeductions.toFixed(2)).toBe("3200.00");
    expect(run.totalNet.toFixed(2)).toBe("40800.00");
  });

  it("locks approved and paid runs, and reopening unlocks them with a logged reason", async () => {
    const shazia = await addEmployee("Shazia", "35000");
    await advances.createAdvance({ employeeId: shazia.id, date: "2026-11-05", amount: "10000", reason: "", plan: "ONE_TIME" });
    await payroll.prepareRun("2026-11");
    const run = (await payroll.getRun("2026-11"))!;
    const lineId = run.lines[0]!.id;

    expect((await payroll.approveRun(run.id)).ok).toBe(true);
    expect(await payroll.updateLine(lineId, { earnings: [], unpaidDays: "1", otherDeductions: [] })).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("locked") });
    expect(await payroll.removeLine(lineId)).toMatchObject({ ok: false, status: 409 });
    const installment = await db().advanceInstallment.findFirstOrThrow();
    expect(await advances.changeInstallment(installment.id, "0", "skip")).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("Reopen") });

    expect((await payroll.payRun(run.id, { paidAt: "2026-11-28", method: "Cash", reference: "" })).ok).toBe(true);
    expect(await db().advanceInstallment.findFirstOrThrow()).toMatchObject({ status: "PAID", payrollLineId: lineId });
    expect((await db().advance.findFirstOrThrow()).status).toBe("CLOSED");
    const payslip = await db().payslip.findFirstOrThrow();
    expect(payslip.snapshot).toMatchObject({ currency: "PKR", net: "28000.00", advanceOutstanding: "0.00", deductions: [{ label: "Advance repayment", amount: "10000.00" }] });
    expect(await payroll.updateLine(lineId, { earnings: [], unpaidDays: "0", otherDeductions: [] })).toMatchObject({ ok: false, status: 409 });

    expect(await payroll.reopenRun(run.id, "")).toMatchObject({ ok: false, status: 400 });
    expect((await payroll.reopenRun(run.id, "Forgot the Eid gift")).ok).toBe(true);
    expect(await db().advanceInstallment.findFirstOrThrow()).toMatchObject({ status: "DUE", payrollLineId: null });
    expect((await db().advance.findFirstOrThrow()).status).toBe("OPEN");
    expect(await db().payslip.count()).toBe(0);
    expect((await payroll.updateLine(lineId, { earnings: [{ kind: "EID_GIFT", label: "Eid gift", amount: "2000" }], unpaidDays: "0", otherDeductions: [] })).ok).toBe(true);

    const log = await db().householdAuditLog.findMany({ where: { entity: "PayrollRun" }, orderBy: { at: "asc" } });
    expect(log.map((l) => l.action)).toEqual(["create", "approve", "pay", "reopen"]);
    expect(log.at(-1)!.after).toMatchObject({ reason: "Forgot the Eid gift" });
  });

  it("won't approve a run where deductions exceed pay", async () => {
    const shazia = await addEmployee("Shazia", "10000");
    await advances.createAdvance({ employeeId: shazia.id, date: "2026-11-05", amount: "50000", reason: "", plan: "ONE_TIME" });
    await payroll.prepareRun("2026-11");
    const run = (await payroll.getRun("2026-11"))!;
    expect(await payroll.approveRun(run.id)).toMatchObject({ ok: false, error: expect.stringContaining("more than their pay") });
  });
});

describe("advances and the draft payroll", () => {
  it("skipping a month in a draft run updates it straight away, and moves the repayment to the end", async () => {
    const shazia = await addEmployee("Shazia", "35000");
    await advances.createAdvance({ employeeId: shazia.id, date: "2026-11-05", amount: "10000", reason: "", plan: "FIXED_MONTHLY", perMonth: "5000" });
    await payroll.prepareRun("2026-11");
    const november = await db().advanceInstallment.findFirstOrThrow({ where: { month: "2026-11" } });

    expect((await advances.changeInstallment(november.id, "0", "Short month")).ok).toBe(true);
    const run = (await payroll.getRun("2026-11"))!;
    expect(run.lines[0]!.net.toFixed(2)).toBe("38000.00");
    const schedule = await db().advanceInstallment.findMany({ orderBy: { month: "asc" } });
    expect(schedule.map((i) => `${i.month} ${i.amount.toFixed(2)} ${i.status}`)).toEqual(["2026-11 5000.00 SKIPPED", "2026-12 5000.00 DUE", "2027-01 5000.00 DUE"]);
    expect(schedule[0]!.note).toBe("Short month");
  });

  it("only removes an advance nothing has been repaid on", async () => {
    const shazia = await addEmployee("Shazia", "35000");
    const created = await advances.createAdvance({ employeeId: shazia.id, date: "2026-11-05", amount: "10000", reason: "", plan: "ONE_TIME" });
    expect(created.ok && (await advances.removeAdvance(created.id)).ok).toBe(true);
    expect(await advances.listAdvances()).toEqual([]);
    expect(await db().householdAuditLog.count({ where: { entity: "Advance", action: "delete" } })).toBe(1);
  });
});
