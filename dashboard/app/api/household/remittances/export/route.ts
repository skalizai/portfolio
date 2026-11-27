import { requireApiSession } from "@/lib/auth";
import { accountLabel } from "@/lib/household/bank-accounts";
import { listRemittances, PURPOSE_LABELS } from "@/lib/household/remittances";
import { xlsxResponse } from "@/lib/household/xlsx";

/** Transfers home as an Excel file, with the same filters as the page. */
export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const rows = await listRemittances({ from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, recipientId: params.get("recipientId") ?? undefined, purpose: params.get("purpose") ?? undefined });
  const headers = ["Date", "Recipient", "Sent (AED)", "Rate (PKR per AED)", "Received (PKR)", "Channel", "To account", "Reference", "Purpose", "Notes"];
  return xlsxResponse(
    `Remittances ${new Date().toISOString().slice(0, 10)}.xlsx`,
    headers,
    rows.map((r) => [r.date, r.recipient.name, Number(r.amountAed), Number(r.rate), Number(r.amountPkr), r.channel, r.bankAccount ? accountLabel(r.bankAccount) : "", r.reference, PURPOSE_LABELS[r.purpose], r.notes]),
    "Remittances",
  );
}
