import { describe, expect, it } from "vitest";
import { D } from "@/lib/household/money";
import { advanceBalance, computeLine, firstRepaymentMonth, planInstallments, replanRemaining, rescheduleInstallment, unpaidLeaveAmount, type ScheduledInstallment } from "@/lib/household/payroll-calc";

const line = (overrides: Partial<Parameters<typeof computeLine>[0]> = {}) =>
  computeLine({ basic: "35000", allowances: [{ name: "Food", amount: "3000" }], earnings: [], unpaidDays: "0", installments: [], otherDeductions: [], ...overrides });

describe("computeLine", () => {
  it("adds basic, allowances and earnings", () => {
    const result = line({ earnings: [{ kind: "EID_GIFT", label: "Eid gift", amount: "5000" }, { kind: "OVERTIME", label: "Overtime", amount: "1250.50" }] });
    expect(result.gross.toFixed(2)).toBe("44250.50");
    expect(result.net.toFixed(2)).toBe("44250.50");
    expect(result.deductions).toEqual([]);
  });

  it("pro-rates unpaid leave from the basic only, at basic ÷ 30 a day", () => {
    expect(unpaidLeaveAmount("35000", "1").toFixed(2)).toBe("1166.67");
    expect(unpaidLeaveAmount("35000", "2.5").toFixed(2)).toBe("2916.67");
    const result = line({ unpaidDays: "3" });
    expect(result.unpaidLeave.toFixed(2)).toBe("3500.00");
    expect(result.deductions[0]).toEqual({ kind: "UNPAID_LEAVE", label: "Unpaid leave (3 days)", amount: "3500.00" });
    expect(result.net.toFixed(2)).toBe("34500.00");
  });

  it("deducts this month's advance installment and anything else added", () => {
    const result = line({ unpaidDays: "1", installments: [{ id: "i1", label: "Advance repayment", amount: "5000" }], otherDeductions: [{ label: "Broken dish", amount: "500" }] });
    expect(result.deductions.map((d) => `${d.kind} ${d.amount}`)).toEqual(["UNPAID_LEAVE 1166.67", "ADVANCE 5000.00", "OTHER 500.00"]);
    expect(result.deductions[1]!.installmentId).toBe("i1");
    expect(result.totalDeductions.toFixed(2)).toBe("6666.67");
    expect(result.net.toFixed(2)).toBe("31333.33");
  });

  it("leaves out skipped (zero) installments", () => {
    expect(line({ installments: [{ id: "i1", label: "Advance", amount: "0" }] }).deductions).toEqual([]);
  });
});

describe("planInstallments", () => {
  it("repays a one-time advance in a single month", () => {
    const plan = planInstallments("20000", { kind: "ONE_TIME", month: "2026-12" });
    expect(plan.ok && plan.installments.map((i) => `${i.month} ${i.amount.toFixed(2)}`)).toEqual(["2026-12 20000.00"]);
  });

  it("spreads a fixed monthly plan, with a smaller last month, across a year end", () => {
    const plan = planInstallments("25000", { kind: "FIXED_MONTHLY", month: "2026-11", perMonth: "10000" });
    expect(plan.ok && plan.installments.map((i) => `${i.month} ${i.amount.toFixed(2)}`)).toEqual(["2026-11 10000.00", "2026-12 10000.00", "2027-01 5000.00"]);
  });

  it("checks a custom schedule adds up exactly", () => {
    expect(planInstallments("10000", { kind: "CUSTOM", rows: [{ month: "2026-12", amount: "4000" }, { month: "2027-02", amount: "6000" }] }).ok).toBe(true);
    expect(planInstallments("10000", { kind: "CUSTOM", rows: [{ month: "2026-12", amount: "4000" }] })).toMatchObject({ ok: false, error: expect.stringContaining("adds up to 4000.00") });
    expect(planInstallments("10000", { kind: "CUSTOM", rows: [{ month: "2026-12", amount: "5000" }, { month: "2026-12", amount: "5000" }] })).toMatchObject({ ok: false, error: expect.stringContaining("only once") });
    expect(planInstallments("0", { kind: "ONE_TIME", month: "2026-12" })).toMatchObject({ ok: false });
  });

  it("works out the first repayment month from the payroll day", () => {
    expect(firstRepaymentMonth(new Date("2026-11-10T00:00:00Z"), 28)).toBe("2026-11");
    expect(firstRepaymentMonth(new Date("2026-11-29T00:00:00Z"), 28)).toBe("2026-12");
  });
});

describe("rescheduleInstallment", () => {
  const schedule: ScheduledInstallment[] = [
    { id: "a", month: "2026-11", amount: new D(10000), status: "PAID" },
    { id: "b", month: "2026-12", amount: new D(10000), status: "DUE" },
    { id: "c", month: "2027-01", amount: new D(5000), status: "DUE" },
  ];

  it("skipping a month moves it to a new month at the end", () => {
    const result = rescheduleInstallment(schedule, "b", "0");
    expect(result.ok && result.result.update.status).toBe("SKIPPED");
    expect(result.ok && result.result.adds.map((i) => `${i.month} ${i.amount.toFixed(2)}`)).toEqual(["2027-02 10000.00"]);
  });

  it("paying less adds the difference at the end", () => {
    const result = rescheduleInstallment(schedule, "b", "4000");
    expect(result.ok && result.result.update).toMatchObject({ status: "DUE" });
    expect(result.ok && result.result.update.amount.toFixed(2)).toBe("4000.00");
    expect(result.ok && result.result.adds.map((i) => `${i.month} ${i.amount.toFixed(2)}`)).toEqual(["2027-02 6000.00"]);
  });

  it("paying more comes off the last months, and can't exceed what's owed", () => {
    const more = rescheduleInstallment(schedule, "b", "12000");
    expect(more.ok && more.result.changes.map((c) => `${c.id} ${c.amount.toFixed(2)}`)).toEqual(["c 3000.00"]);
    const all = rescheduleInstallment(schedule, "b", "15000");
    expect(all.ok && all.result.removes).toEqual(["c"]);
    expect(rescheduleInstallment(schedule, "b", "15001")).toMatchObject({ ok: false, error: expect.stringContaining("15000.00 still owed") });
  });

  it("refuses to change a month that's already paid", () => {
    expect(rescheduleInstallment(schedule, "a", "0")).toMatchObject({ ok: false, error: expect.stringContaining("still due") });
  });
});

describe("advanceBalance", () => {
  it("counts only paid installments as repaid", () => {
    const balance = advanceBalance("25000", [
      { amount: "10000", status: "PAID" },
      { amount: "10000", status: "SKIPPED" },
      { amount: "5000", status: "DUE" },
    ]);
    expect([balance.total, balance.repaid, balance.outstanding].map((v) => v.toFixed(2))).toEqual(["25000.00", "10000.00", "15000.00"]);
  });
});

describe("replanRemaining", () => {
  const due = (id: string, month: string, amount: string, status: ScheduledInstallment["status"] = "DUE"): ScheduledInstallment => ({ id, month, amount: new D(amount), status });
  const tenMonths = Array.from({ length: 10 }, (_, i) => due(`i${i}`, `2026-${String(i + 1).padStart(2, "0")}`, "2000"));

  it("replaces what's due with a new monthly amount, still repaying in full", () => {
    const result = replanRemaining("20000", tenMonths, new Set(), "4000");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.removes).toHaveLength(10);
    expect(result.result.adds.map((a) => `${a.month} ${a.amount.toFixed(0)}`)).toEqual(["2026-01 4000", "2026-02 4000", "2026-03 4000", "2026-04 4000", "2026-05 4000"]);
  });

  it("keeps paid and approved months, starts after them and ends with a smaller month", () => {
    const schedule = [due("a", "2026-01", "2000", "PAID"), due("b", "2026-02", "2000"), ...tenMonths.slice(2)];
    const result = replanRemaining("20000", schedule, new Set(["2026-02"]), "7000");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.removes).not.toContain("a");
    expect(result.result.removes).not.toContain("b");
    expect(result.result.remaining.toFixed(0)).toBe("16000");
    expect(result.result.adds.map((a) => `${a.month} ${a.amount.toFixed(0)}`)).toEqual(["2026-03 7000", "2026-04 7000", "2026-05 2000"]);
  });

  it("goes around a skipped month and refuses a start before a paid one", () => {
    const schedule = [due("a", "2026-01", "2000", "PAID"), due("s", "2026-02", "2000", "SKIPPED"), due("c", "2026-03", "2000")];
    const result = replanRemaining("6000", schedule, new Set(), "1000", "2026-02");
    expect(result.ok && result.result.adds.map((a) => a.month)).toEqual(["2026-03", "2026-04", "2026-05", "2026-06"]);
    expect(replanRemaining("6000", schedule, new Set(), "1000", "2026-01")).toMatchObject({ ok: false });
  });

  it("refuses nonsense", () => {
    expect(replanRemaining("20000", tenMonths, new Set(), "0")).toMatchObject({ ok: false });
    expect(replanRemaining("20000", tenMonths, new Set(), "100")).toMatchObject({ ok: false, error: expect.stringContaining("5 years") });
    expect(replanRemaining("2000", [due("a", "2026-01", "2000", "PAID")], new Set(), "500")).toMatchObject({ ok: false, error: expect.stringContaining("Nothing") });
  });
});
