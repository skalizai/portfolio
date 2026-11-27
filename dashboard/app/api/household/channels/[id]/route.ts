import { requireApiSession } from "@/lib/auth";
import { removeChannel } from "@/lib/household/bank-accounts";

/** Takes a channel off the list; transfers already recorded keep its name. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const result = await removeChannel((await params).id);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true });
}
