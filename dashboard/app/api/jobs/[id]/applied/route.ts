import { z } from "zod";
import { setApplied } from "@/lib/applications/applied";
import { requireApiSession } from "@/lib/auth";

const BodySchema = z.object({ applied: z.boolean() });

/** The Applied tick box on a job. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  const result = await setApplied((await params).id, body.data.applied);
  return "error" in result ? Response.json({ error: result.error }, { status: result.code }) : Response.json(result);
}
