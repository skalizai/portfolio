import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

/** You applied on the employer's own site, so this records it, with a copy of what you used. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const { id } = await params;
  const application = await db().application.findUnique({ where: { id }, select: { submittedAt: true, coverLetter: true, tailoredCv: true, history: true, jobId: true } });
  if (!application) return Response.json({ error: "Application not found." }, { status: 404 });
  if (application.submittedAt) return Response.json({ error: "You've already marked this as applied." }, { status: 409 });

  const now = new Date();
  const entry = { at: now.toISOString(), action: "marked-submitted", coverLetter: application.coverLetter, tailoredCv: application.tailoredCv };
  await db().application.update({
    where: { id },
    data: {
      status: "SUBMITTED",
      submittedAt: now,
      history: [...(application.history as Prisma.JsonArray), entry] as Prisma.InputJsonValue,
    },
  });
  await db().auditLog.create({ data: { action: "application.marked_submitted", jobId: application.jobId, applicationId: id } });
  return Response.json({ status: "SUBMITTED" });
}
