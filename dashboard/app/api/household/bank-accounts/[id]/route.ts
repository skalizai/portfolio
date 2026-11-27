import { requireApiSession } from "@/lib/auth";
import { removeBankAccount } from "@/lib/household/bank-accounts";

/** Removes a bank account from the list; past transfers to it are kept. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const result = await removeBankAccount((await params).id);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true });
}
