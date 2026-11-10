import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createTransaction, TransactionInputSchema } from "@/lib/investments/service";

export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  return Response.json(await db().transaction.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { instrument: { select: { symbol: true } } } }));
}

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = TransactionInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid transaction" }, { status: 400 });
  const result = await createTransaction(body.data);
  return result.ok ? Response.json({ id: result.id }, { status: 201 }) : Response.json({ error: result.error }, { status: result.status });
}
