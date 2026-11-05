import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";

const BodySchema = z.object({ state: z.enum(["ACTIVE", "SAVED", "DISMISSED"]) });

/** Save a job for later, or dismiss it so that it no longer appears or costs anything to score. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid state." }, { status: 400 });

  const { count } = await db().job.updateMany({ where: { id: (await params).id }, data: { state: body.data.state } });
  return count ? Response.json({ state: body.data.state }) : Response.json({ error: "Job not found." }, { status: 404 });
}
