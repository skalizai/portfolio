import { requireApiSession } from "@/lib/auth";
import { LineInputSchema, removeLine, updateLine } from "@/lib/household/payroll";

type Context = { params: Promise<{ lineId: string }> };

export async function PUT(request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = LineInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the entries" }, { status: 400 });
  const result = await updateLine((await params).lineId, body.data);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const result = await removeLine((await params).lineId);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
}
