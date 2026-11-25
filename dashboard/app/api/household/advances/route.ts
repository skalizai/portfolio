import { requireApiSession } from "@/lib/auth";
import { AdvanceInputSchema, createAdvance, listAdvances } from "@/lib/household/advances";

export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  return Response.json(await listAdvances({ employeeId: params.get("employeeId") ?? undefined, status: params.get("status") ?? undefined }));
}

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = AdvanceInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  const result = await createAdvance(body.data);
  return result.ok ? Response.json({ id: result.id }, { status: 201 }) : Response.json({ error: result.error }, { status: result.status });
}
