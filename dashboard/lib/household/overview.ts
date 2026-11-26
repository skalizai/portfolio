import { db } from "@/lib/db";
import { expiryAlerts, listEmployees } from "@/lib/household/employees";
import { listAdvances } from "@/lib/household/advances";
import { addMonths, aedFromPkr, D, type Dec, monthOf, monthRange, type Num, round2, sum, ZERO } from "@/lib/household/money";
import { PURPOSE_LABELS, type Purpose } from "@/lib/household/remittances";
import { getHouseholdSettings } from "@/lib/household/settings";

export type OutflowMonth = { month: string; payrollAed: number; remittancesAed: number; expensesAed: number };
export type Slice = { key: string; name: string; aed: number };

/**
 * Up to three named slices, with the rest folded into "Other", so a chart never needs more than
 * three colours plus a grey.
 */
export function topThree(slices: Slice[]): Slice[] {
  const sorted = [...slices].filter((s) => s.aed > 0).sort((a, b) => b.aed - a.aed);
  if (sorted.length <= 4) return sorted;
  const rest = sorted.slice(3).reduce((total, s) => total + s.aed, 0);
  return [...sorted.slice(0, 3), { key: "other", name: "Other", aed: Math.round(rest * 100) / 100 }];
}

/** Payroll in AED at the default rate, since it's paid in PKR. */
const payrollAed = (pkr: Num, rate: Num) => (new D(rate).gt(0) ? aedFromPkr(pkr, rate) : ZERO);

/**
 * Everything the Household overview shows for a month and the year to that month. Payroll counts
 * once it's marked paid. Queries run one after another, which suits the small connection pool.
 */
export async function getOverview(month: string) {
  const settings = await getHouseholdSettings();
  const rate = settings.defaultPkrPerAed;
  const year = month.slice(0, 4);
  const firstChartMonth = addMonths(month, -5);
  const fromDate = monthRange(`${year}-01` < firstChartMonth ? `${year}-01` : firstChartMonth).start;
  const toDate = monthRange(month).end;

  const runs = await db().payrollRun.findMany({ where: { month: { gte: `${year}-01` < firstChartMonth ? `${year}-01` : firstChartMonth, lte: month } }, select: { month: true, status: true, totalNet: true, paidAt: true } });
  const remittances = await db().remittance.findMany({
    where: { deletedAt: null, date: { gte: fromDate, lt: toDate } },
    orderBy: { date: "desc" },
    include: { recipient: { select: { id: true, name: true, relationship: true } } },
  });
  const expenses = await db().expense.findMany({ where: { deletedAt: null, date: { gte: fromDate, lt: toDate } }, include: { category: { select: { id: true, name: true } } } });
  const advances = await listAdvances({ status: "OPEN" });
  const employees = await listEmployees();

  const inMonth = (d: Date) => monthOf(d) === month;
  const inYear = (d: Date) => monthOf(d) >= `${year}-01` && monthOf(d) <= month;
  const paidRuns = runs.filter((r) => r.status === "PAID");
  const monthRun = runs.find((r) => r.month === month) ?? null;

  const payrollMonthPkr = round2(sum(paidRuns.filter((r) => r.month === month).map((r) => r.totalNet)));
  const payrollYtdPkr = round2(sum(paidRuns.filter((r) => r.month >= `${year}-01`).map((r) => r.totalNet)));
  const remMonth = remittances.filter((r) => inMonth(r.date));
  const remYtd = remittances.filter((r) => inYear(r.date));
  const expMonth = expenses.filter((e) => inMonth(e.date));
  const expYtd = expenses.filter((e) => inYear(e.date));

  const totals = (rows: { amountAed: Num; amountPkr?: Num; feeAed?: Num }[]) => ({
    aed: round2(sum(rows.map((r) => r.amountAed))),
    pkr: round2(sum(rows.map((r) => r.amountPkr ?? 0))),
    fees: round2(sum(rows.map((r) => r.feeAed ?? 0))),
  });
  const sentMonth = totals(remMonth);
  const sentYtd = totals(remYtd);
  const spentMonth = round2(sum(expMonth.map((e) => e.amountAed)));
  const spentYtd = round2(sum(expYtd.map((e) => e.amountAed)));
  const toWifeMonth = totals(remMonth.filter((r) => r.recipient.relationship === "WIFE"));
  const outstanding = round2(sum(advances.map((a) => a.balance.outstanding)));

  const outflow = (payrollPkr: Dec, sent: { aed: Dec; fees: Dec }, spent: Dec) => round2(payrollAed(payrollPkr, rate).plus(sent.aed).plus(sent.fees).plus(spent));

  const chart: OutflowMonth[] = Array.from({ length: 6 }, (_, i) => {
    const m = addMonths(firstChartMonth, i);
    const sentM = totals(remittances.filter((r) => monthOf(r.date) === m));
    return {
      month: m,
      payrollAed: Number(payrollAed(sum(paidRuns.filter((r) => r.month === m).map((r) => r.totalNet)), rate)),
      remittancesAed: Number(sentM.aed.plus(sentM.fees)),
      expensesAed: Number(round2(sum(expenses.filter((e) => monthOf(e.date) === m).map((e) => e.amountAed)))),
    };
  });

  const group = <T>(rows: T[], key: (r: T) => string, name: (r: T) => string, aed: (r: T) => Num): Slice[] => {
    const map = new Map<string, Slice>();
    for (const r of rows) {
      const k = key(r);
      const current = map.get(k) ?? { key: k, name: name(r), aed: 0 };
      map.set(k, { ...current, aed: Math.round((current.aed + Number(aed(r))) * 100) / 100 });
    }
    return [...map.values()];
  };

  return {
    month,
    year,
    rate,
    kpis: {
      payrollMonthPkr,
      payrollMonthAed: payrollAed(payrollMonthPkr, rate),
      payrollYtdPkr,
      outstanding,
      sentMonth,
      sentYtd,
      toWifeMonth,
      spentMonth,
      spentYtd,
      outflowMonth: outflow(payrollMonthPkr, sentMonth, spentMonth),
      outflowYtd: outflow(payrollYtdPkr, sentYtd, spentYtd),
    },
    chart,
    byRecipient: topThree(group(remYtd, (r) => r.recipient.id, (r) => r.recipient.name, (r) => r.amountAed)),
    byPurpose: topThree(group(remYtd, (r) => r.purpose, (r) => PURPOSE_LABELS[r.purpose as Purpose], (r) => r.amountAed)),
    byCategory: topThree(group(expYtd, (e) => e.category.id, (e) => e.category.name, (e) => e.amountAed)),
    monthRun,
    advances: advances.slice(0, 5),
    recentTransfers: remittances.slice(0, 5),
    expiries: expiryAlerts(employees, settings.expiryAlertDays),
    alertDays: settings.expiryAlertDays,
    staff: employees.filter((e) => e.status !== "LEFT").length,
  };
}

/** One line for the Home page card. */
export async function householdHomeSummary() {
  const month = monthOf(new Date());
  const staff = await db().employee.count({ where: { deletedAt: null, status: { not: "LEFT" } } });
  const run = await db().payrollRun.findUnique({ where: { month }, select: { status: true } });
  const payroll = run ? { DRAFT: "in draft", APPROVED: "approved", PAID: "paid" }[run.status] : "not started";
  return `${staff} ${staff === 1 ? "employee" : "employees"} · this month's payroll ${payroll}`;
}
