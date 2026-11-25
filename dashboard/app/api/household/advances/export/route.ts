import { requireApiSession } from "@/lib/auth";
import { listAdvances, PLAN_LABELS } from "@/lib/household/advances";
import { xlsxResponse } from "@/lib/household/xlsx";

/** Every installment of every advance, so the file shows the full repayment history. */
export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const advances = await listAdvances({ employeeId: params.get("employeeId") ?? undefined, status: params.get("status") ?? undefined });
  const headers = ["Employee", "Advance date", "Reason", "Plan", "Advance (PKR)", "Repaid (PKR)", "Outstanding (PKR)", "Status", "Installment month", "Installment (PKR)", "Installment status", "Note"];
  const rows = advances.flatMap((a) =>
    a.installments.map((i) => [
      a.employee.fullName,
      a.date,
      a.reason,
      PLAN_LABELS[a.plan],
      Number(a.balance.total),
      Number(a.balance.repaid),
      Number(a.balance.outstanding),
      a.status === "OPEN" ? "Open" : "Closed",
      i.month,
      Number(i.amount),
      i.status === "DUE" ? "Due" : i.status === "PAID" ? "Paid" : "Skipped",
      i.note,
    ]),
  );
  return xlsxResponse(`Household advances ${new Date().toISOString().slice(0, 10)}.xlsx`, headers, rows, "Advances");
}
