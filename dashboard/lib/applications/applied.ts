import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

export type AppliedResult = { status: "applied" | "not-applied" } | { error: string; code: 404 | 409 };

/**
 * Records that you applied for a job yourself, or undoes it. A job with no cover letter gets a
 * simple record. Undoing removes that record, or turns a prepared draft back into a draft.
 */
export async function setApplied(jobId: string, applied: boolean, now = new Date()): Promise<AppliedResult> {
  const job = await db().job.findUnique({
    where: { id: jobId },
    select: { applyChannel: true, application: { select: { id: true, status: true, submittedAt: true, coverLetter: true, tailoredCv: true, history: true } } },
  });
  if (!job) return { error: "Job not found.", code: 404 };
  const application = job.application;
  const history = (application?.history as Prisma.JsonArray | undefined) ?? [];

  if (applied) {
    if (application?.submittedAt) return { status: "applied" };
    const entry = { at: now.toISOString(), action: "marked-applied", coverLetter: application?.coverLetter ?? null, tailoredCv: application?.tailoredCv ?? null };
    if (application) {
      await db().application.update({
        where: { id: application.id },
        data: { status: "SUBMITTED", submittedAt: now, history: [...history, entry] as Prisma.InputJsonValue },
      });
    } else {
      await db().application.create({ data: { jobId, channel: job.applyChannel, status: "SUBMITTED", submittedAt: now, history: [entry] } });
    }
    await db().auditLog.create({ data: { action: "application.marked_submitted", jobId } });
    return { status: "applied" };
  }

  if (!application?.submittedAt) return { status: "not-applied" };
  // Once it's moved on to an interview or an outcome, it's changed on the Applications page instead.
  if (application.status !== "SUBMITTED") return { error: "This application has moved on. Change its stage on the Applications page.", code: 409 };

  if (!application.coverLetter && !application.tailoredCv) {
    await db().application.delete({ where: { id: application.id } });
  } else {
    await db().application.update({
      where: { id: application.id },
      data: { status: "DRAFT", submittedAt: null, history: [...history, { at: now.toISOString(), action: "unmarked-applied" }] as Prisma.InputJsonValue },
    });
  }
  await db().auditLog.create({ data: { action: "application.unmarked_submitted", jobId } });
  return { status: "not-applied" };
}
