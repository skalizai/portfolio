import { requireApiSession } from "@/lib/auth";
import { removeAdvance } from "@/lib/household/advances";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const result = await removeAdvance((await params).id);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
}
