import { addMonths, D, type Dec, monthOf, type Num, round2, sum, ZERO } from "@/lib/household/money";

/**
 * The arithmetic for advances and payroll, with no database, so it can be tested on its own.
 * Every amount is PKR, rounded to the paisa.
 */

export type Earning = { kind: "OVERTIME" | "BONUS" | "EID_GIFT" | "OTHER"; label: string; amount: string };
export type Deduction = { kind: "ADVANCE" | "UNPAID_LEAVE" | "OTHER"; label: string; amount: string; installmentId?: string };

export const EARNING_LABELS: Record<Earning["kind"], string> = { OVERTIME: "Overtime", BONUS: "Bonus", EID_GIFT: "Eid gift", OTHER: "Other" };

export type LineInput = {
  basic: Num;
  allowances: { name: string; amount: Num }[];
  earnings: { kind: Earning["kind"]; label: string; amount: Num }[];
  unpaidDays: Num;
  /** This month's advance installments for the employee. */
  installments: { id: string; label: string; amount: Num }[];
  otherDeductions: { label: string; amount: Num }[];
};

export type LineResult = {
  unpaidLeave: Dec;
  deductions: Deduction[];
  gross: Dec;
  totalDeductions: Dec;
  net: Dec;
};

/** Unpaid leave is pro-rated from the basic salary: basic ÷ 30 for each unpaid day. */
export const unpaidLeaveAmount = (basic: Num, days: Num) => round2(new D(basic).dividedBy(30).times(days));

/**
 * Gross is basic plus allowances plus this month's earnings. Deductions are unpaid leave, advance
 * installments and anything else you add. Net is gross less deductions.
 */
export function computeLine(input: LineInput): LineResult {
  const gross = round2(sum([input.basic, ...input.allowances.map((a) => a.amount), ...input.earnings.map((e) => e.amount)]));
  const unpaidLeave = unpaidLeaveAmount(input.basic, input.unpaidDays);
  const deductions: Deduction[] = [
    ...(unpaidLeave.gt(0) ? [{ kind: "UNPAID_LEAVE" as const, label: `Unpaid leave (${new D(input.unpaidDays).toString()} ${new D(input.unpaidDays).eq(1) ? "day" : "days"})`, amount: unpaidLeave.toFixed(2) }] : []),
    ...input.installments.filter((i) => new D(i.amount).gt(0)).map((i) => ({ kind: "ADVANCE" as const, label: i.label, amount: round2(i.amount).toFixed(2), installmentId: i.id })),
    ...input.otherDeductions.filter((d) => new D(d.amount).gt(0)).map((d) => ({ kind: "OTHER" as const, label: d.label, amount: round2(d.amount).toFixed(2) })),
  ];
  const totalDeductions = round2(sum(deductions.map((d) => d.amount)));
  return { unpaidLeave, deductions, gross, totalDeductions, net: round2(gross.minus(totalDeductions)) };
}

/** The payroll month an advance given on a date is first repaid in: this month if before payroll day, else next. */
export function firstRepaymentMonth(date: Date, payrollDay: number): string {
  const month = monthOf(date);
  return date.getUTCDate() <= payrollDay ? month : addMonths(month, 1);
}

export type PlannedInstallment = { month: string; amount: Dec };

/**
 * The repayment schedule for an advance. A fixed monthly plan repays the same amount each month
 * with a smaller last one. A custom plan must add up to the advance exactly.
 */
export function planInstallments(
  amount: Num,
  plan: { kind: "ONE_TIME"; month: string } | { kind: "FIXED_MONTHLY"; month: string; perMonth: Num } | { kind: "CUSTOM"; rows: { month: string; amount: Num }[] },
): { ok: true; installments: PlannedInstallment[] } | { ok: false; error: string } {
  const total = round2(amount);
  if (total.lte(0)) return { ok: false, error: "The advance must be more than zero." };

  if (plan.kind === "ONE_TIME") return { ok: true, installments: [{ month: plan.month, amount: total }] };

  if (plan.kind === "FIXED_MONTHLY") {
    const per = round2(plan.perMonth);
    if (per.lte(0)) return { ok: false, error: "Enter how much is repaid each month." };
    const count = total.dividedBy(per).ceil().toNumber();
    if (count > 60) return { ok: false, error: "That would take more than 5 years to repay. Please raise the monthly amount." };
    const installments = Array.from({ length: count }, (_, i) => ({ month: addMonths(plan.month, i), amount: i === count - 1 ? total.minus(per.times(count - 1)) : per }));
    return { ok: true, installments };
  }

  const rows = plan.rows.map((r) => ({ month: r.month, amount: round2(r.amount) })).filter((r) => r.amount.gt(0));
  if (!rows.length) return { ok: false, error: "Add at least one month to the schedule." };
  if (new Set(rows.map((r) => r.month)).size !== rows.length) return { ok: false, error: "Each month can appear only once in the schedule." };
  const scheduled = sum(rows.map((r) => r.amount));
  if (!scheduled.eq(total)) return { ok: false, error: `The schedule adds up to ${scheduled.toFixed(2)}, but the advance is ${total.toFixed(2)}.` };
  return { ok: true, installments: rows.sort((a, b) => a.month.localeCompare(b.month)) };
}

export type ScheduledInstallment = { id: string; month: string; amount: Dec; status: "DUE" | "PAID" | "SKIPPED" };

export type Reschedule = {
  update: { amount: Dec; status: "DUE" | "SKIPPED" };
  /** Changes to later installments that are still due, and new ones to add at the end. */
  changes: { id: string; amount: Dec }[];
  removes: string[];
  adds: PlannedInstallment[];
};

/**
 * Changing one month's installment keeps the advance fully repaid: paying less (or skipping, which
 * is paying 0) adds the difference as a new month at the end; paying more takes it off the last
 * months still due.
 */
export function rescheduleInstallment(schedule: ScheduledInstallment[], targetId: string, newAmount: Num): { ok: true; result: Reschedule } | { ok: false; error: string } {
  const target = schedule.find((i) => i.id === targetId);
  if (!target) return { ok: false, error: "That installment doesn't exist." };
  if (target.status !== "DUE") return { ok: false, error: "Only an installment that's still due can be changed." };
  const amount = round2(newAmount);
  if (amount.lt(0)) return { ok: false, error: "The amount can't be negative." };

  const update = { amount: amount.isZero() ? target.amount : amount, status: amount.isZero() ? ("SKIPPED" as const) : ("DUE" as const) };
  const difference = target.amount.minus(amount);
  const later = schedule.filter((i) => i.status === "DUE" && i.id !== targetId).sort((a, b) => a.month.localeCompare(b.month));

  if (difference.gt(0)) {
    const lastMonth = [target, ...later].map((i) => i.month).sort().at(-1)!;
    return { ok: true, result: { update, changes: [], removes: [], adds: [{ month: addMonths(lastMonth, 1), amount: difference }] } };
  }
  if (difference.isZero()) return { ok: true, result: { update, changes: [], removes: [], adds: [] } };

  // Paying more: take the extra off the last months, so it can't exceed what's still owed.
  let extra = difference.negated();
  const outstanding = sum(later.map((i) => i.amount));
  if (extra.gt(outstanding)) return { ok: false, error: `That's more than the ${target.amount.plus(outstanding).toFixed(2)} still owed on this advance.` };
  const changes: { id: string; amount: Dec }[] = [];
  const removes: string[] = [];
  for (const installment of [...later].reverse()) {
    if (extra.lte(0)) break;
    if (installment.amount.lte(extra)) {
      removes.push(installment.id);
      extra = extra.minus(installment.amount);
    } else {
      changes.push({ id: installment.id, amount: installment.amount.minus(extra) });
      extra = ZERO;
    }
  }
  return { ok: true, result: { update, changes, removes, adds: [] } };
}

/** What's been advanced, repaid and is still owed. Skipped months don't count as repaid. */
export function advanceBalance(amount: Num, installments: { amount: Num; status: string }[]) {
  const total = round2(amount);
  const repaid = round2(sum(installments.filter((i) => i.status === "PAID").map((i) => i.amount)));
  return { total, repaid, outstanding: round2(total.minus(repaid)) };
}
