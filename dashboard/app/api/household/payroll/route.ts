import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { listRuns, prepareRun } from "@/lib/household/payroll";

export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  return Response.json(await listRuns());
}

/** Starts a month's payroll. A month that already has one is refused. */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = z.object({ month: z.string() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Choose a month." }, { status: 400 });
  const result = await prepareRun(body.data.month);
  return result.ok ? Response.json({ id: result.id, month: body.data.month }, { status: 201 }) : Response.json({ error: result.error }, { status: result.status });
}
