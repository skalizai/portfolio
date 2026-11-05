import { z } from "zod";
import { detectChannel, isValidEmail } from "@/lib/apply/channelDetect";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";

const BodySchema = z.object({ email: z.string().trim().toLowerCase().max(254).refine(isValidEmail, "That doesn't look like an email address.").nullable() });

/** Sets the address you found for a job. Removing it goes back to whatever the listing says. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid email." }, { status: 400 });

  const { id } = await params;
  const job = await db().job.findUnique({ where: { id }, select: { description: true, url: true, applyUrl: true } });
  if (!job) return Response.json({ error: "Job not found." }, { status: 404 });

  const { email } = body.data;
  const detected = detectChannel({ description: job.description, applyUrls: [job.applyUrl, job.url] });
  const applyEmail = email ?? detected.applyEmail;
  const applyChannel = email ? "EMAIL" : detected.applyChannel;

  await db().$transaction([
    db().job.update({ where: { id }, data: { applyEmail, applyChannel } }),
    db().application.updateMany({ where: { jobId: id, submittedAt: null, sendAt: null }, data: { channel: applyChannel } }),
    db().auditLog.create({ data: { action: "job.email_set", jobId: id, payload: { byYou: email !== null } } }),
  ]);
  return Response.json({ applyEmail });
}
