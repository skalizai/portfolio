import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/household/audit";
import { D, isMonth, monthOf } from "@/lib/household/money";
import { advanceBalance, firstRepaymentMonth, planInstallments, rescheduleInstallment } from "@/lib/household/payroll-calc";
import { recomputeDraftLinesForMonth } from "@/lib/household/payroll";
import { getHouseholdSettings } from "@/lib/household/settings";

type Tx = Parameters<Parameters<ReturnType<typeof db>["$transaction"]>[0]>[0];

const amount = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, `${label} must be an amount in rupees, like 20000`);

export const PLAN_LABELS = { ONE_TIME: "One payment, next payroll", FIXED_MONTHLY: "Fixed monthly installment", CUSTOM: "Custom schedule" } as const;

export const AdvanceInputSchema = z.object({
  employeeId: z.string().min(1, "Choose an employee"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date"),
  amount: amount("The advance"),
  reason: z.string().trim().max(300).default(""),
  plan: z.enum(["ONE_TIME", "FIXED_MONTHLY", "CUSTOM"]),
  perMonth: amount("The monthly installment").optional(),
  startMonth: z.string().refine(isMonth, "Choose the first month").optional(),
  schedule: z.array(z.object({ month: z.string().refine(isMonth, "Choose a month for each row"), amount: amount("Each scheduled amount") })).max(60).optional(),
});

export type AdvanceInput = z.infer<typeof AdvanceInputSchema>;

/** A run for a month that's approved or paid can't change, so neither can that month's installments. */
async function lockedMonth(tx: Tx, month: string) {
  const run = await tx.payrollRun.findUnique({ where: { month }, select: { status: true } });
  return run && run.status !== "DRAFT" ? run.status : null;
}

export async function createAdvance(input: AdvanceInput): Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> {
  const employee = await db().employee.findFirst({ where: { id: input.employeeId, deletedAt: null }, select: { id: true } });
  if (!employee) return { ok: false, error: "That employee doesn't exist.", status: 404 };

  const settings = await getHouseholdSettings();
  const date = new Date(`${input.date}T00:00:00Z`);
  const first = input.startMonth ?? firstRepaymentMonth(date, settings.payrollDay);
  const planned = planInstallments(
    input.amount,
    input.plan === "ONE_TIME"
      ? { kind: "ONE_TIME", month: first }
      : input.plan === "FIXED_MONTHLY"
        ? { kind: "FIXED_MONTHLY", month: first, perMonth: input.perMonth ?? "0" }
        : { kind: "CUSTOM", rows: input.schedule ?? [] },
  );
  if (!planned.ok) return { ok: false, error: planned.error, status: 400 };

  return db().$transaction(async (tx) => {
    for (const month of new Set(planned.installments.map((i) => i.month))) {
      const locked = await lockedMonth(tx, month);
      if (locked) return { ok: false as const, error: `Payroll for ${month} is already ${locked === "PAID" ? "paid" : "approved"}, so the first repayment has to be in a later month.`, status: 409 };
    }
    const advance = await tx.advance.create({
      data: {
        employeeId: input.employeeId,
        date,
        amount: new D(input.amount),
        reason: input.reason,
        plan: input.plan,
        installments: { create: planned.installments.map((i) => ({ month: i.month, amount: i.amount })) },
      },
      include: { installments: true },
    });
    await audit(tx, { entity: "Advance", entityId: advance.id, action: "create", after: advance });
    for (const month of new Set(planned.installments.map((i) => i.month))) await recomputeDraftLinesForMonth(tx, month, input.employeeId);
    return { ok: true as const, id: advance.id };
  });
}

/** Changes or skips one month's repayment, keeping the advance fully repaid overall. */
export async function changeInstallment(installmentId: string, newAmount: string, note: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  return db().$transaction(async (tx) => {
    const installment = await tx.advanceInstallment.findUnique({ where: { id: installmentId }, include: { advance: { include: { installments: true } } } });
    if (!installment || installment.advance.deletedAt) return { ok: false as const, error: "That installment doesn't exist.", status: 404 };
    const locked = await lockedMonth(tx, installment.month);
    if (locked) return { ok: false as const, error: `Payroll for ${installment.month} is ${locked === "PAID" ? "paid" : "approved"}. Reopen it first to change this month.`, status: 409 };

    const schedule = installment.advance.installments.map((i) => ({ id: i.id, month: i.month, amount: new D(i.amount), status: i.status }));
    const plan = rescheduleInstallment(schedule, installmentId, newAmount);
    if (!plan.ok) return { ok: false as const, error: plan.error, status: 400 };

    const { update, changes, removes, adds } = plan.result;
    await tx.advanceInstallment.update({ where: { id: installmentId }, data: { amount: update.amount, status: update.status, note: note.trim().slice(0, 300) } });
    for (const change of changes) await tx.advanceInstallment.update({ where: { id: change.id }, data: { amount: change.amount } });
    if (removes.length) await tx.advanceInstallment.deleteMany({ where: { id: { in: removes } } });
    for (const add of adds) await tx.advanceInstallment.create({ data: { advanceId: installment.advanceId, month: add.month, amount: add.amount } });

    const after = await tx.advance.findUnique({ where: { id: installment.advanceId }, include: { installments: true } });
    await audit(tx, { entity: "Advance", entityId: installment.advanceId, action: update.status === "SKIPPED" ? "skip-installment" : "change-installment", before: installment.advance, after });
    const months = new Set([installment.month, ...adds.map((a) => a.month), ...schedule.filter((s) => changes.some((c) => c.id === s.id) || removes.includes(s.id)).map((s) => s.month)]);
    for (const month of months) await recomputeDraftLinesForMonth(tx, month, installment.advance.employeeId);
    return { ok: true as const };
  });
}

/** Removes an advance that hasn't been repaid at all. One with repayments stays, for the record. */
export async function removeAdvance(id: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  return db().$transaction(async (tx) => {
    const advance = await tx.advance.findFirst({ where: { id, deletedAt: null }, include: { installments: true } });
    if (!advance) return { ok: false as const, error: "That advance doesn't exist.", status: 404 };
    if (advance.installments.some((i) => i.status === "PAID")) return { ok: false as const, error: "Part of this advance is already repaid, so it can't be removed.", status: 409 };
    for (const month of new Set(advance.installments.map((i) => i.month))) {
      const locked = await lockedMonth(tx, month);
      if (locked) return { ok: false as const, error: `Payroll for ${month} is ${locked === "PAID" ? "paid" : "approved"}. Reopen it first.`, status: 409 };
    }
    await tx.advanceInstallment.deleteMany({ where: { advanceId: id } });
    const after = await tx.advance.update({ where: { id }, data: { deletedAt: new Date(), status: "CLOSED" } });
    await audit(tx, { entity: "Advance", entityId: id, action: "delete", before: advance, after });
    for (const month of new Set(advance.installments.map((i) => i.month))) await recomputeDraftLinesForMonth(tx, month, advance.employeeId);
    return { ok: true as const };
  });
}

/** Advances with their schedules and balances, newest first, optionally filtered. */
export async function listAdvances(filters: { employeeId?: string; status?: string } = {}) {
  const advances = await db().advance.findMany({
    where: {
      deletedAt: null,
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(filters.status === "OPEN" || filters.status === "CLOSED" ? { status: filters.status } : {}),
    },
    orderBy: [{ status: "desc" }, { date: "desc" }],
    include: { employee: { select: { id: true, fullName: true } }, installments: { orderBy: { month: "asc" } } },
  });
  return advances.map((a) => ({ ...a, balance: advanceBalance(a.amount, a.installments) }));
}

/** The month an installment shows up in, for the "next due" hint. */
export const currentMonth = () => monthOf(new Date());
