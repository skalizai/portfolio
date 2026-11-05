import { TailoredCvSchema, type TailoredCv } from "@/lib/apply/cvSchema";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getSearchSettings } from "@/lib/search/settings";

/** The undo window: a confirmed email waits this long, and can be cancelled until it goes. */
export const UNDO_MS = 60_000;
/** Minimum gap between emails to the same company's domain. */
export const DOMAIN_GAP_MS = 120_000;

const VALID_EMAIL = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export type OutgoingEmail = { to: string; subject: string; text: string; cv: TailoredCv };
export type Deliver = (email: OutgoingEmail) => Promise<{ messageId: string }>;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD);
}

/** Imported here rather than at the top, so that nothing loads these until an email actually goes. */
const deliverBySmtp: Deliver = async ({ to, subject, text, cv }) => {
  const [{ default: nodemailer }, { renderCvPdf }] = await Promise.all([import("nodemailer"), import("@/lib/apply/cvPdf")]);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.mail.yahoo.com",
    port: Number(process.env.SMTP_PORT) || 465,
    secure: (Number(process.env.SMTP_PORT) || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD },
  });
  const info = await transport.sendMail({
    from: { name: cv.name, address: process.env.SMTP_USER! },
    to,
    subject,
    text,
    attachments: [{ filename: `CV - ${cv.name}.pdf`.replace(/[^A-Za-z0-9 .-]/g, ""), content: await renderCvPdf(cv), contentType: "application/pdf" }],
  });
  return { messageId: info.messageId };
};

const domainOf = (email: string) => email.split("@")[1]!.toLowerCase();
const startOfDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export type QueueResult = {
  queued: { id: string; sendAt: Date }[];
  skipped: { id: string; reason: string }[];
};

/** Why a draft can't be emailed, or null if it can. */
function emailProblem(application: {
  channel: string;
  coverLetter: string | null;
  tailoredCv: unknown;
  submittedAt: Date | null;
  sendAt: Date | null;
  job: { applyEmail: string | null };
}): string | null {
  if (application.submittedAt) return "You've already applied for this job.";
  if (application.sendAt) return "This is already waiting to send.";
  if (application.channel !== "EMAIL" || !application.job.applyEmail) return "This job isn't applied for by email.";
  if (!VALID_EMAIL.test(application.job.applyEmail)) return "The listing's email address doesn't look valid.";
  if (!application.coverLetter?.trim()) return "This draft has no cover letter.";
  if (!TailoredCvSchema.safeParse(application.tailoredCv).success) return "This draft has no CV.";
  return null;
}

/**
 * Queues confirmed emails. Each waits for the undo window, respects the gap between emails to one
 * company and counts towards the daily cap. With onlyClean, drafts with something to check are left
 * for you to look at, which is what stops Approve all sending something you haven't considered.
 */
export async function queueApplications(ids: string[], options: { now?: Date; onlyClean?: boolean } = {}): Promise<QueueResult> {
  const now = options.now ?? new Date();
  const result: QueueResult = { queued: [], skipped: [] };

  const settings = await getSearchSettings();
  const dayStart = startOfDay(now);
  const [sentToday, waiting, recent] = await Promise.all([
    db().application.count({ where: { submittedAt: { gte: dayStart } } }),
    db().application.count({ where: { sendAt: { not: null } } }),
    db().application.findMany({
      where: {
        OR: [{ sendAt: { not: null } }, { submittedAt: { gte: new Date(now.getTime() - DOMAIN_GAP_MS) } }],
        job: { applyEmail: { not: null } },
      },
      select: { sendAt: true, submittedAt: true, job: { select: { applyEmail: true } } },
    }),
  ]);
  let allowance = Math.max(0, settings.dailyApplyCap - sentToday - waiting);

  const lastByDomain = new Map<string, number>();
  const note = (email: string, time: number) => {
    const domain = domainOf(email);
    lastByDomain.set(domain, Math.max(lastByDomain.get(domain) ?? 0, time));
  };
  for (const entry of recent) {
    if (entry.job.applyEmail?.includes("@")) note(entry.job.applyEmail, (entry.sendAt ?? entry.submittedAt!).getTime());
  }

  const applications = await db().application.findMany({
    where: { id: { in: ids } },
    select: { id: true, channel: true, coverLetter: true, tailoredCv: true, submittedAt: true, sendAt: true, draftWarnings: true, history: true, jobId: true, job: { select: { applyEmail: true } } },
  });

  for (const id of ids) {
    const application = applications.find((a) => a.id === id);
    if (!application) {
      result.skipped.push({ id, reason: "This draft no longer exists." });
      continue;
    }
    const problem = emailProblem(application);
    if (problem) {
      result.skipped.push({ id, reason: problem });
      continue;
    }
    if (options.onlyClean && application.draftWarnings.length) {
      result.skipped.push({ id, reason: "This draft has something for you to check first." });
      continue;
    }
    if (allowance <= 0) {
      result.skipped.push({ id, reason: `Today's limit of ${settings.dailyApplyCap} applications is reached.` });
      continue;
    }

    const email = application.job.applyEmail!;
    const earliest = now.getTime() + UNDO_MS;
    const sendAt = new Date(Math.max(earliest, (lastByDomain.get(domainOf(email)) ?? 0) + DOMAIN_GAP_MS));
    const { count } = await db().application.updateMany({
      where: { id, submittedAt: null, sendAt: null },
      data: {
        status: "READY",
        sendAt,
        history: [...(application.history as Prisma.JsonArray), { at: now.toISOString(), action: "confirmed", sendAt: sendAt.toISOString() }] as Prisma.InputJsonValue,
      },
    });
    if (!count) {
      result.skipped.push({ id, reason: "This draft has just changed. Please try again." });
      continue;
    }
    note(email, sendAt.getTime());
    allowance--;
    result.queued.push({ id, sendAt });
    await db().auditLog.create({ data: { action: "application.queued", applicationId: id, jobId: application.jobId, payload: { sendAt: sendAt.toISOString() } } });
  }
  return result;
}

/** Cancels a queued email, as long as it hasn't started sending. */
export async function cancelSend(id: string): Promise<boolean> {
  const { count } = await db().application.updateMany({ where: { id, sendAt: { not: null }, submittedAt: null }, data: { sendAt: null, status: "DRAFT" } });
  if (count) await db().auditLog.create({ data: { action: "application.cancelled", applicationId: id } });
  return count > 0;
}

/**
 * Sends whatever is due. Only emails you've confirmed are ever in the queue. Each is claimed by
 * clearing its sendAt before sending, so overlapping runs can't send it twice. If a run dies right
 * after that, the email doesn't go and the draft shows as not sent, which is the safer way to fail.
 */
export async function processDueSends(options: { now?: Date; deliver?: Deliver } = {}): Promise<{ sent: number; failed: number; waiting: number }> {
  const now = options.now ?? new Date();
  const deliver = options.deliver ?? deliverBySmtp;
  const due = await db().application.findMany({
    where: { sendAt: { lte: now }, submittedAt: null },
    orderBy: { sendAt: "asc" },
    select: { id: true, jobId: true, sendAt: true, coverLetter: true, tailoredCv: true, history: true, draftWarnings: true, job: { select: { title: true, applyEmail: true } } },
  });

  let sent = 0;
  let failed = 0;
  for (const application of due) {
    const { count } = await db().application.updateMany({ where: { id: application.id, sendAt: application.sendAt }, data: { sendAt: null } });
    if (!count) continue;

    const cv = TailoredCvSchema.safeParse(application.tailoredCv);
    const history = application.history as Prisma.JsonArray;
    const email = cv.success && application.job.applyEmail && application.coverLetter
      ? { to: application.job.applyEmail, subject: `Application — ${application.job.title} — ${cv.data.name}`, text: application.coverLetter, cv: cv.data }
      : null;

    try {
      if (!email) throw new Error("incomplete draft");
      const { messageId } = await deliver(email);
      const at = new Date();
      await db().application.update({
        where: { id: application.id },
        data: {
          status: "SUBMITTED",
          submittedAt: at,
          emailMessageId: messageId,
          history: [...history, { at: at.toISOString(), action: "sent", to: email.to, subject: email.subject, coverLetter: email.text, tailoredCv: application.tailoredCv, messageId }] as Prisma.InputJsonValue,
        },
      });
      await db().auditLog.create({ data: { action: "application.sent", applicationId: application.id, jobId: application.jobId, payload: { to: email.to, messageId } } });
      sent++;
    } catch (error) {
      failed++;
      // SMTP errors can echo account details, so only a general message is shown and stored.
      const message = "The email couldn't be sent, so nothing went out. Check your Yahoo app password in the settings, then try again.";
      await db().application.update({
        where: { id: application.id },
        data: {
          status: "DRAFT",
          draftWarnings: application.draftWarnings.includes(message) ? undefined : [...application.draftWarnings, message],
          history: [...history, { at: new Date().toISOString(), action: "send-failed", kind: error instanceof Error ? error.name : "unknown" }] as Prisma.InputJsonValue,
        },
      });
      await db().auditLog.create({ data: { action: "application.send_failed", applicationId: application.id, jobId: application.jobId } });
    }
  }

  const waiting = await db().application.count({ where: { sendAt: { not: null } } });
  return { sent, failed, waiting };
}
