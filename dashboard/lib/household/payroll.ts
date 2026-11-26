import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { audit } from "@/lib/household/audit";
import { D, isMonth, mask, round2, sum } from "@/lib/household/money";
import { advanceBalance, computeLine, type Deduction, type Earning } from "@/lib/household/payroll-calc";

type Tx = Parameters<Parameters<ReturnType<typeof db>["$transaction"]>[0]>[0];
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };

const amount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Amounts must be in rupees, like 5000");

export const LineInputSchema = z.object({
  earnings: z.array(z.object({ kind: z.enum(["OVERTIME", "BONUS", "EID_GIFT", "OTHER"]), label: z.string().trim().min(1, "Describe each earning").max(80), amount })).max(15).default([]),
  unpaidDays: z
    .string()
    .trim()
    .regex(/^\d+(\.5)?$/, "Unpaid days must be whole or half days, like 2 or 1.5")
    .refine((value) => Number(value) <= 31, "There can't be more than 31 unpaid days")
    .default("0"),
  otherDeductions: z.array(z.object({ label: z.string().trim().min(1, "Describe each deduction").max(80), amount })).max(15).default([]),
});

export const PayInputSchema = z.object({
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date paid"),
  method: z.enum(["Cash", "Bank transfer", "Mixed"]),
  reference: z.string().trim().max(100).default(""),
});

const json = (value: unknown) => value as Prisma.InputJsonValue;

/** Works a line out again from its employee's installments for the month and its own entries. */
export async function recomputeLine(tx: Tx, lineId: string) {
  const line = await tx.payrollLine.findUnique({ where: { id: lineId }, include: { run: { select: { month: true } } } });
  if (!line) return;
  const installments = await tx.advanceInstallment.findMany({
    where: {
      month: line.run.month,
      advance: { employeeId: line.employeeId, deletedAt: null },
      OR: [{ status: "DUE" }, { status: "PAID", payrollLineId: line.id }],
    },
    include: { advance: { select: { date: true, reason: true } } },
    orderBy: { advance: { date: "asc" } },
  });
  const deductions = line.deductions as Deduction[];
  const result = computeLine({
    basic: line.basic,
    allowances: line.allowances as { name: string; amount: string }[],
    earnings: line.earnings as Earning[],
    unpaidDays: line.unpaidDays,
    installments: installments.map((i) => ({
      id: i.id,
      label: `Advance repayment${i.advance.reason ? ` (${i.advance.reason})` : ""}`,
      amount: i.amount,
    })),
    otherDeductions: deductions.filter((d) => d.kind === "OTHER"),
  });
  await tx.payrollLine.update({ where: { id: lineId }, data: { deductions: json(result.deductions), gross: result.gross, totalDeductions: result.totalDeductions, net: result.net } });
}

async function recomputeTotals(tx: Tx, runId: string) {
  const lines = await tx.payrollLine.findMany({ where: { runId }, select: { gross: true, totalDeductions: true, net: true } });
  await tx.payrollRun.update({
    where: { id: runId },
    data: { totalGross: round2(sum(lines.map((l) => l.gross))), totalDeductions: round2(sum(lines.map((l) => l.totalDeductions))), totalNet: round2(sum(lines.map((l) => l.net))) },
  });
}

/** Keeps a month's draft payroll in step when an advance changes. Approved and paid runs are left alone. */
export async function recomputeDraftLinesForMonth(tx: Tx, month: string, employeeId: string) {
  const run = await tx.payrollRun.findUnique({ where: { month }, select: { id: true, status: true } });
  if (!run || run.status !== "DRAFT") return;
  const line = await tx.payrollLine.findUnique({ where: { runId_employeeId: { runId: run.id, employeeId } }, select: { id: true } });
  if (!line) return;
  await recomputeLine(tx, line.id);
  await recomputeTotals(tx, run.id);
}

async function addEmployeeLine(tx: Tx, runId: string, employee: { id: string; basicSalary: Prisma.Decimal; allowances: { name: string; amount: Prisma.Decimal }[] }) {
  const line = await tx.payrollLine.create({
    data: {
      runId,
      employeeId: employee.id,
      basic: employee.basicSalary,
      allowances: json(employee.allowances.map((a) => ({ name: a.name, amount: a.amount.toFixed(2) }))),
      gross: 0,
      totalDeductions: 0,
      net: 0,
    },
  });
  await recomputeLine(tx, line.id);
  return line;
}

/**
 * Starts a month's payroll with every active employee (and anyone on leave), at their current basic
 * and allowances, with that month's advance repayments already deducted. One run per month.
 */
/** Starts a month's payroll for everyone active or on leave. `demo` limits it to the demo staff. */
export async function prepareRun(month: string, options: { demo?: boolean } = {}): Promise<Result<{ id: string }>> {
  if (!isMonth(month)) return { ok: false, error: "Choose a month.", status: 400 };
  const existing = await db().payrollRun.findUnique({ where: { month }, select: { id: true } });
  if (existing) return { ok: false, error: `Payroll for ${month} already exists. Open it to make changes.`, status: 409 };

  try {
    return await db().$transaction(async (tx) => {
      const run = await tx.payrollRun.create({ data: { month, isDemo: options.demo ?? false } });
      const employees = await tx.employee.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...(options.demo ? { isDemo: true } : {}) }, include: { allowances: true }, orderBy: { fullName: "asc" } });
      for (const employee of employees) await addEmployeeLine(tx, run.id, employee);
      await recomputeTotals(tx, run.id);
      await audit(tx, { entity: "PayrollRun", entityId: run.id, action: "create", after: { month, employees: employees.length } });
      return { ok: true as const, id: run.id };
    });
  } catch {
    // Two clicks at once can race; the database allows only one run per month.
    return { ok: false, error: `Payroll for ${month} already exists. Open it to make changes.`, status: 409 };
  }
}

async function draftRunFor(tx: Tx, lineId: string) {
  const line = await tx.payrollLine.findUnique({ where: { id: lineId }, include: { run: true } });
  if (!line) return { ok: false as const, error: "That payroll line doesn't exist.", status: 404 };
  if (line.run.status !== "DRAFT") return { ok: false as const, error: `This payroll is ${line.run.status === "PAID" ? "paid" : "approved"} and locked. Reopen it to make changes.`, status: 409 };
  return { ok: true as const, line };
}

export async function updateLine(lineId: string, input: z.infer<typeof LineInputSchema>): Promise<Result> {
  return db().$transaction(async (tx) => {
    const found = await draftRunFor(tx, lineId);
    if (!found.ok) return found;
    const before = found.line;
    await tx.payrollLine.update({
      where: { id: lineId },
      data: {
        earnings: json(input.earnings),
        unpaidDays: new D(input.unpaidDays),
        deductions: json(input.otherDeductions.map((d) => ({ kind: "OTHER", label: d.label, amount: d.amount }))),
      },
    });
    await recomputeLine(tx, lineId);
    await recomputeTotals(tx, before.runId);
    const after = await tx.payrollLine.findUnique({ where: { id: lineId } });
    await audit(tx, { entity: "PayrollLine", entityId: lineId, action: "update", before, after });
    return { ok: true as const };
  });
}

export async function removeLine(lineId: string): Promise<Result> {
  return db().$transaction(async (tx) => {
    const found = await draftRunFor(tx, lineId);
    if (!found.ok) return found;
    await tx.payrollLine.delete({ where: { id: lineId } });
    await recomputeTotals(tx, found.line.runId);
    await audit(tx, { entity: "PayrollLine", entityId: lineId, action: "delete", before: found.line });
    return { ok: true as const };
  });
}

/** Adds someone who wasn't included when the run was prepared, such as a new starter. */
export async function addLine(runId: string, employeeId: string): Promise<Result> {
  return db().$transaction(async (tx) => {
    const run = await tx.payrollRun.findUnique({ where: { id: runId } });
    if (!run) return { ok: false as const, error: "That payroll doesn't exist.", status: 404 };
    if (run.status !== "DRAFT") return { ok: false as const, error: "This payroll is locked. Reopen it to make changes.", status: 409 };
    const employee = await tx.employee.findFirst({ where: { id: employeeId, deletedAt: null }, include: { allowances: true } });
    if (!employee) return { ok: false as const, error: "That employee doesn't exist.", status: 404 };
    if (await tx.payrollLine.findUnique({ where: { runId_employeeId: { runId, employeeId } } })) return { ok: false as const, error: `${employee.fullName} is already in this payroll.`, status: 409 };
    const line = await addEmployeeLine(tx, runId, employee);
    await recomputeTotals(tx, runId);
    await audit(tx, { entity: "PayrollLine", entityId: line.id, action: "create", after: { runId, employeeId } });
    return { ok: true as const };
  });
}

/** Locks a draft. Nothing can change until it's paid or reopened. */
export async function approveRun(runId: string): Promise<Result> {
  return db().$transaction(async (tx) => {
    const run = await tx.payrollRun.findUnique({ where: { id: runId }, include: { lines: { include: { employee: { select: { fullName: true } } } } } });
    if (!run) return { ok: false as const, error: "That payroll doesn't exist.", status: 404 };
    if (run.status !== "DRAFT") return { ok: false as const, error: "Only a draft can be approved.", status: 409 };
    if (!run.lines.length) return { ok: false as const, error: "Add at least one employee before approving.", status: 400 };
    const negative = run.lines.find((l) => l.net.lt(0));
    if (negative) return { ok: false as const, error: `${negative.employee.fullName}'s deductions are more than their pay. Please adjust them first.`, status: 400 };
    await tx.payrollRun.update({ where: { id: runId }, data: { status: "APPROVED", approvedAt: new Date() } });
    await audit(tx, { entity: "PayrollRun", entityId: runId, action: "approve", before: { status: "DRAFT" }, after: { status: "APPROVED" } });
    return { ok: true as const };
  });
}

/**
 * Records that an approved run was paid: marks this month's advance repayments as paid, closes any
 * advance now fully repaid, and freezes a payslip for each employee.
 */
export async function payRun(runId: string, input: z.infer<typeof PayInputSchema>): Promise<Result> {
  return db().$transaction(async (tx) => {
    const run = await tx.payrollRun.findUnique({ where: { id: runId }, include: { lines: { include: { employee: true } } } });
    if (!run) return { ok: false as const, error: "That payroll doesn't exist.", status: 404 };
    if (run.status !== "APPROVED") return { ok: false as const, error: "Approve the payroll before marking it paid.", status: 409 };
    const paidAt = new Date(`${input.paidAt}T00:00:00Z`);
    const settings = await tx.householdSettings.findUnique({ where: { id: "default" } });

    for (const line of run.lines) {
      const installmentIds = (line.deductions as Deduction[]).filter((d) => d.kind === "ADVANCE" && d.installmentId).map((d) => d.installmentId!);
      if (installmentIds.length) await tx.advanceInstallment.updateMany({ where: { id: { in: installmentIds }, status: "DUE" }, data: { status: "PAID", payrollLineId: line.id, paidAt } });
    }
    const touched = await tx.advance.findMany({ where: { deletedAt: null, status: "OPEN", employeeId: { in: run.lines.map((l) => l.employeeId) } }, include: { installments: true } });
    for (const advance of touched) {
      if (advanceBalance(advance.amount, advance.installments).outstanding.lte(0)) await tx.advance.update({ where: { id: advance.id }, data: { status: "CLOSED" } });
    }

    for (const line of run.lines) {
      const open = await tx.advance.findMany({ where: { employeeId: line.employeeId, deletedAt: null }, include: { installments: true } });
      const outstanding = sum(open.map((a) => advanceBalance(a.amount, a.installments).outstanding));
      const snapshot = {
        currency: "PKR",
        month: run.month,
        employer: { name: settings?.employerName ?? "", address: settings?.address ?? "" },
        employee: { name: line.employee.fullName, role: line.employee.role, cnic: mask(line.employee.cnicNo), joiningDate: line.employee.joiningDate.toISOString().slice(0, 10) },
        earnings: [{ label: "Basic salary", amount: line.basic.toFixed(2) }, ...(line.allowances as { name: string; amount: string }[]).map((a) => ({ label: a.name, amount: a.amount })), ...(line.earnings as Earning[]).map((e) => ({ label: e.label, amount: e.amount }))],
        deductions: (line.deductions as Deduction[]).map((d) => ({ label: d.label, amount: d.amount })),
        gross: line.gross.toFixed(2),
        totalDeductions: line.totalDeductions.toFixed(2),
        net: line.net.toFixed(2),
        advanceOutstanding: round2(outstanding).toFixed(2),
        payment: { date: input.paidAt, method: input.method, reference: input.reference },
      };
      await tx.payslip.upsert({ where: { runId_employeeId: { runId, employeeId: line.employeeId } }, create: { runId, employeeId: line.employeeId, snapshot: json(snapshot) }, update: { snapshot: json(snapshot) } });
    }

    await tx.payrollRun.update({ where: { id: runId }, data: { status: "PAID", paidAt, paidMethod: input.method, reference: input.reference } });
    await audit(tx, { entity: "PayrollRun", entityId: runId, action: "pay", before: { status: "APPROVED" }, after: { status: "PAID", ...input } });
    return { ok: true as const };
  });
}

/**
 * Unlocks an approved or paid run for changes, with your reason in the log. Reopening a paid run
 * puts its advance repayments back to due and withdraws its payslips until it's paid again.
 */
export async function reopenRun(runId: string, reason: string): Promise<Result> {
  if (!reason.trim()) return { ok: false, error: "Say why you're reopening it, for the log.", status: 400 };
  return db().$transaction(async (tx) => {
    const run = await tx.payrollRun.findUnique({ where: { id: runId }, include: { lines: { select: { id: true } } } });
    if (!run) return { ok: false as const, error: "That payroll doesn't exist.", status: 404 };
    if (run.status === "DRAFT") return { ok: false as const, error: "This payroll is already open.", status: 409 };
    if (run.status === "PAID") {
      const lineIds = run.lines.map((l) => l.id);
      const paid = await tx.advanceInstallment.findMany({ where: { payrollLineId: { in: lineIds } }, select: { advanceId: true } });
      await tx.advanceInstallment.updateMany({ where: { payrollLineId: { in: lineIds } }, data: { status: "DUE", payrollLineId: null, paidAt: null } });
      await tx.advance.updateMany({ where: { id: { in: [...new Set(paid.map((p) => p.advanceId))] } }, data: { status: "OPEN" } });
      await tx.payslip.deleteMany({ where: { runId } });
    }
    await tx.payrollRun.update({ where: { id: runId }, data: { status: "DRAFT", approvedAt: null, paidAt: null, paidMethod: "", reference: "" } });
    await audit(tx, { entity: "PayrollRun", entityId: runId, action: "reopen", before: { status: run.status, paidAt: run.paidAt, reference: run.reference }, after: { status: "DRAFT", reason: reason.trim() } });
    return { ok: true as const };
  });
}

export async function getRun(month: string) {
  return db().payrollRun.findUnique({
    where: { month },
    include: { lines: { include: { employee: { select: { id: true, fullName: true, role: true, paymentMethod: true } } }, orderBy: { employee: { fullName: "asc" } } } },
  });
}

export async function listRuns() {
  return db().payrollRun.findMany({ orderBy: { month: "desc" }, include: { _count: { select: { lines: true } } } });
}
