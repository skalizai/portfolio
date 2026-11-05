import { z } from "zod";
import { isEmailConfigured, queueApplications } from "@/lib/apply/send";
import { requireApiSession } from "@/lib/auth";

const BodySchema = z.object({ confirm: z.literal(true), ids: z.array(z.string().min(1)).min(1).max(50) });

/** Queues the drafts you confirmed. Any draft with something to check is left for you to look at. */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Sending needs your confirmation." }, { status: 400 });
  if (!isEmailConfigured()) return Response.json({ error: "Email isn't set up yet. Add your Yahoo address and app password first." }, { status: 503 });

  return Response.json(await queueApplications(body.data.ids, { onlyClean: true }));
}
