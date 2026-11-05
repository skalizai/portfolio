import { z } from "zod";
import { isEmailConfigured, queueApplications } from "@/lib/apply/send";
import { requireApiSession } from "@/lib/auth";

const BodySchema = z.object({ confirm: z.literal(true) });

/** Queues one email after your confirmation. It goes after the undo window. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  if (!BodySchema.safeParse(await request.json().catch(() => null)).success) {
    return Response.json({ error: "Sending needs your confirmation." }, { status: 400 });
  }
  if (!isEmailConfigured()) return Response.json({ error: "Email isn't set up yet. Add your Yahoo address and app password first." }, { status: 503 });

  const { queued, skipped } = await queueApplications([(await params).id]);
  return queued[0] ? Response.json(queued[0]) : Response.json({ error: skipped[0]?.reason ?? "This draft couldn't be queued." }, { status: 409 });
}
