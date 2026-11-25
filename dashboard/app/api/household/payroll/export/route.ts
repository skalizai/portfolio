import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Deduction, Earning } from "@/lib/household/payroll-calc";
import { xlsxResponse } from "@/lib/household/xlsx";

const STATUS = { DRAFT: "Draft", APPROVED: "Approved", PAID: "Paid" } as const;

/** One month's payroll line by line, or with no month, every run's totals. */
export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const month = new URL(request.url).searchParams.get("month");
  if (!month) {
    const runs = await db().payrollRun.findMany({ orderBy: { month: "desc" }, include: { _count: { select: { lines: true } } } });
    return xlsxResponse(
      "Household payroll history.xlsx",
      ["Month", "Status", "Employees", "Gross (PKR)", "Deductions (PKR)", "Net (PKR)", "Paid on", "Method", "Reference"],
      runs.map((r) => [r.month, STATUS[r.status], r._count.lines, Number(r.totalGross), Number(r.totalDeductions), Number(r.totalNet), r.paidAt, r.paidMethod, r.reference]),
      "Payroll history",
    );
  }

  const run = await db().payrollRun.findUnique({ where: { month }, include: { lines: { include: { employee: { select: { fullName: true, role: true } } }, orderBy: { employee: { fullName: "asc" } } } } });
  if (!run) return Response.json({ error: "No payroll for that month." }, { status: 404 });
  const sumOf = (items: { amount: string }[]) => items.reduce((total, item) => total + Number(item.amount), 0);
  return xlsxResponse(
    `Household payroll ${month}.xlsx`,
    ["Employee", "Role", "Basic (PKR)", "Allowances (PKR)", "Earnings (PKR)", "Unpaid days", "Unpaid leave (PKR)", "Advance (PKR)", "Other deductions (PKR)", "Gross (PKR)", "Deductions (PKR)", "Net (PKR)"],
    run.lines.map((l) => {
      const deductions = l.deductions as Deduction[];
      return [
        l.employee.fullName,
        l.employee.role,
        Number(l.basic),
        sumOf(l.allowances as { amount: string }[]),
        sumOf(l.earnings as Earning[]),
        Number(l.unpaidDays),
        sumOf(deductions.filter((d) => d.kind === "UNPAID_LEAVE")),
        sumOf(deductions.filter((d) => d.kind === "ADVANCE")),
        sumOf(deductions.filter((d) => d.kind === "OTHER")),
        Number(l.gross),
        Number(l.totalDeductions),
        Number(l.net),
      ];
    }),
    `Payroll ${month}`,
  );
}
