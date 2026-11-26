import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PORT = 5551;

let server: PGLiteSocketServer;
let pg: PGlite;
let db: typeof import("@/lib/db").db;
let remittances: typeof import("@/lib/household/remittances");
let expenses: typeof import("@/lib/household/expenses");
let demo: typeof import("@/lib/household/demo");
let overview: typeof import("@/lib/household/overview");

beforeAll(async () => {
  pg = await PGlite.create();
  const dirs = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) await pg.exec(readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8"));
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;
  ({ db } = await import("@/lib/db"));
  remittances = await import("@/lib/household/remittances");
  expenses = await import("@/lib/household/expenses");
  demo = await import("@/lib/household/demo");
  overview = await import("@/lib/household/overview");
});

afterAll(async () => {
  await db().$disconnect();
  await server.stop();
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(
    'TRUNCATE "household"."Payslip", "household"."PayrollLine", "household"."PayrollRun", "household"."AdvanceInstallment", "household"."Advance", "household"."EmployeeAllowance", "household"."Employee", "household"."Remittance", "household"."Expense", "household"."RecurringExpense", "household"."HouseholdAuditLog" CASCADE',
  );
  await pg.exec(`DELETE FROM "household"."Recipient" WHERE id <> 'recipient-wife'`);
  // Emptying Employee cascades to the recipients linked to staff, so the built-in one is put back.
  await pg.exec(`INSERT INTO "household"."Recipient" ("id", "name", "relationship") VALUES ('recipient-wife', 'Wife', 'WIFE') ON CONFLICT DO NOTHING`);
  await pg.exec(`UPDATE "household"."ExpenseCategory" SET "monthlyBudgetAed" = NULL`);
});

const transfer = (overrides: Partial<import("@/lib/household/remittances").RemittanceInput> = {}) =>
  remittances.RemittanceInputSchema.parse({ date: "2026-11-02", recipientId: "recipient-wife", amountAed: "2000", rate: "76.25", purpose: "HOUSEHOLD", ...overrides });

describe("remittances", () => {
  it("works out PKR received from the rate, unless the actual amount is entered", async () => {
    const worked = await remittances.createRemittance(transfer());
    const entered = await remittances.createRemittance(transfer({ amountPkr: "152000", feeAed: "15" }));
    expect(worked.ok && entered.ok).toBe(true);
    const rows = await remittances.listRemittances();
    expect(rows.map((r) => r.amountPkr.toFixed(2)).sort()).toEqual(["152000.00", "152500.00"]);
    expect(await db().householdAuditLog.count({ where: { entity: "Remittance" } })).toBe(2);
  });

  it("refuses a zero amount, a bad rate and an unknown recipient", async () => {
    expect(remittances.RemittanceInputSchema.safeParse({ ...transfer(), rate: "0" }).success).toBe(false);
    expect(await remittances.createRemittance(transfer({ amountAed: "0" }))).toMatchObject({ ok: false, status: 400 });
    expect(await remittances.createRemittance(transfer({ recipientId: "nobody" }))).toMatchObject({ ok: false, status: 404 });
  });

  it("totals by recipient, purpose and month, with the average rate weighted by amount", async () => {
    const mother = await remittances.createRecipient(remittances.RecipientInputSchema.parse({ name: "Mother", relationship: "MOTHER", monthlyTargetAed: "1000" }));
    await remittances.createRemittance(transfer({ amountAed: "3000", rate: "76" }));
    await remittances.createRemittance(transfer({ recipientId: mother.id, amountAed: "1000", rate: "80", purpose: "MEDICAL", feeAed: "10" }));
    await remittances.createRemittance(transfer({ date: "2026-10-01", amountAed: "500", rate: "75" }));

    const rows = await remittances.listRemittances({ from: "2026-11-01", to: "2026-11-30" });
    const s = remittances.summarizeRemittances(rows);
    expect(s.aed.toFixed(2)).toBe("4000.00");
    expect(s.pkr.toFixed(2)).toBe("308000.00");
    expect(s.fees.toFixed(2)).toBe("10.00");
    expect(s.averageRate!.toFixed(2)).toBe("77.00");
    expect(s.byPurpose.map((p) => `${p.name} ${p.aed.toFixed(0)}`)).toEqual(["Household 3000", "Medical 1000"]);

    const target = remittances.targetProgress(await remittances.listRecipients(), rows, "2026-11");
    expect(target).toEqual([expect.objectContaining({ name: "Mother", share: 100 })]);

    expect((await remittances.listRemittances({ recipientId: mother.id })).length).toBe(1);
    expect((await remittances.removeRemittance(rows[0]!.id)).ok).toBe(true);
    expect((await remittances.listRemittances()).length).toBe(2);
  });
});

describe("expenses", () => {
  const expense = (overrides: Record<string, string> = {}) => expenses.ExpenseInputSchema.parse({ date: "2026-11-05", categoryId: "cat-groceries", amount: "800", currency: "AED", ...overrides });

  it("converts a PKR expense to AED at the rate given", async () => {
    const created = await expenses.createExpense(expense({ currency: "PKR", amount: "15250", rate: "76.25" }));
    expect(created.ok).toBe(true);
    const [row] = await expenses.listExpenses({ month: "2026-11" });
    expect(row!.amountAed.toFixed(2)).toBe("200.00");
    expect(expenses.pkrPerAedOf(row!.rateToAed)!.toFixed(2)).toBe("76.25");
  });

  it("flags categories near or over budget", async () => {
    await expenses.updateCategory("cat-groceries", { name: "Groceries", monthlyBudgetAed: "1000", isActive: true });
    await expenses.updateCategory("cat-utilities", { name: "Utilities / DEWA", monthlyBudgetAed: "500", isActive: true });
    await expenses.createExpense(expense());
    await expenses.createExpense(expense({ categoryId: "cat-utilities", amount: "650" }));
    const lines = expenses.budgetStatus(await expenses.listCategories(), await expenses.listExpenses({ month: "2026-11" }));
    expect(lines.find((l) => l.id === "cat-groceries")).toMatchObject({ level: "near", share: 80 });
    expect(lines.find((l) => l.id === "cat-utilities")).toMatchObject({ level: "over", share: 130 });
  });

  it("creates each recurring expense once a month, on or after its day, as to confirm", async () => {
    await expenses.createRecurring({ name: "Rent", categoryId: "cat-rent", amount: "6000", currency: "AED", dayOfMonth: 10 });
    expect(await expenses.createDueRecurring(new Date("2026-11-09T12:00:00Z"))).toBe(0);
    const [a, b] = await Promise.all([expenses.createDueRecurring(new Date("2026-11-10T12:00:00Z")), expenses.createDueRecurring(new Date("2026-11-10T12:00:00Z"))]);
    expect(a + b).toBe(1);
    expect(await expenses.createDueRecurring(new Date("2026-11-25T12:00:00Z"))).toBe(0);
    const [rent] = await expenses.listExpenses({ month: "2026-11" });
    expect(rent).toMatchObject({ status: "PENDING", notes: "Rent" });
    expect(rent!.date.toISOString().slice(0, 10)).toBe("2026-11-10");
    expect((await expenses.confirmExpense(rent!.id)).ok).toBe(true);
    expect(await expenses.createDueRecurring(new Date("2026-12-10T12:00:00Z"))).toBe(1);
  });

  it("won't allow two categories with the same name", async () => {
    expect(await expenses.createCategory({ name: "Groceries", isActive: true })).toMatchObject({ ok: false, status: 409 });
  });
});

describe("demo data", () => {
  it("loads a full sample, shows in the overview, and clears without touching your own records", async () => {
    await remittances.createRemittance(transfer({ date: "2026-11-20", amountAed: "100" }));
    const loaded = await demo.loadDemoData(new Date("2026-11-26T00:00:00Z"));
    expect(loaded).toEqual({ ok: true, skippedMonths: [] });
    expect(await demo.loadDemoData(new Date("2026-11-26T00:00:00Z"))).toMatchObject({ ok: false, status: 409 });

    expect(await db().payrollRun.count({ where: { status: "PAID", isDemo: true } })).toBe(2);
    expect(await db().payslip.count()).toBe(4);
    const advance = await db().advance.findFirstOrThrow({ where: { isDemo: true }, include: { installments: true } });
    expect(advance.installments.filter((i) => i.status === "PAID")).toHaveLength(2);

    const o = await overview.getOverview("2026-10");
    expect(o.kpis.payrollMonthPkr.toFixed(0)).toBe("83000");
    expect(o.kpis.outstanding.toFixed(0)).toBe("10000");
    expect(o.chart).toHaveLength(6);
    expect(o.byRecipient.length).toBeGreaterThan(0);

    const cleared = await demo.clearDemoData();
    expect(cleared.removed).toBeGreaterThan(10);
    expect(await db().employee.count()).toBe(0);
    expect(await db().payrollRun.count()).toBe(0);
    expect(await db().remittance.count()).toBe(1);
    expect(await db().recipient.count({ where: { id: "recipient-wife" } })).toBe(1);
    expect(await demo.hasDemoData()).toBe(false);
  });

  it("leaves out a payroll month you already have", async () => {
    await db().payrollRun.create({ data: { month: "2026-09" } });
    expect(await demo.loadDemoData(new Date("2026-11-26T00:00:00Z"))).toEqual({ ok: true, skippedMonths: ["2026-09"] });
    await demo.clearDemoData();
    expect(await db().payrollRun.count()).toBe(1);
  });
});

describe("topThree", () => {
  it("keeps three named slices and folds the rest into Other", () => {
    const slices = ["a", "b", "c", "d", "e"].map((k, i) => ({ key: k, name: k, aed: 100 - i * 10 }));
    expect(overview.topThree(slices).map((s) => `${s.name} ${s.aed}`)).toEqual(["a 100", "b 90", "c 80", "Other 130"]);
    expect(overview.topThree(slices.slice(0, 4))).toHaveLength(4);
  });
});
