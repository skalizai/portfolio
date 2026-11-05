import { z } from "zod";
import { prepareDraft } from "@/lib/apply/prepare";
import { requireApiSession } from "@/lib/auth";

export const maxDuration = 300;

const BodySchema = z.object({ jobIds: z.array(z.string().min(1)).min(1).max(3) });

/** Prepares drafts for the chosen jobs. Nothing is sent. */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Choose between 1 and 3 jobs." }, { status: 400 });

  const results = [];
  for (const jobId of body.data.jobIds) results.push(await prepareDraft(jobId));
  return Response.json({ results });
}
