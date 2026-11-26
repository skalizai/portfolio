import { requireApiSession } from "@/lib/auth";
import { EXPENSE_STATUS_LABELS, listExpenses } from "@/lib/household/expenses";
import { xlsxResponse } from "@/lib/household/xlsx";

/** Expenses as an Excel file, with the same filters as the page. */
export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const rows = await listExpenses({ month: params.get("month") ?? undefined, categoryId: params.get("categoryId") ?? undefined, status: params.get("status") ?? undefined });
  const headers = ["Date", "Category", "Amount", "Currency", "Amount (AED)", "Payment method", "Status", "Notes"];
  return xlsxResponse(
    `Household expenses ${new Date().toISOString().slice(0, 10)}.xlsx`,
    headers,
    rows.map((e) => [e.date, e.category.name, Number(e.amount), e.currency, Number(e.amountAed), e.paymentMethod, EXPENSE_STATUS_LABELS[e.status], e.notes]),
    "Expenses",
  );
}
