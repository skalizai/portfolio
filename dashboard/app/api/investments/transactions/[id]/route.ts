import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const { count } = await db().transaction.deleteMany({ where: { id: (await params).id } });
  if (count) await db().auditLog.create({ data: { action: "investments.transaction_deleted" } });
  return count ? Response.json({ ok: true }) : Response.json({ error: "Transaction not found." }, { status: 404 });
}
