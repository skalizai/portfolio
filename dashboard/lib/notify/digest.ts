import { db } from "@/lib/db";
import { sponsorshipStatus } from "@/lib/matching/filters";
import { RULES_VERSION } from "@/lib/matching/scoreJobs";
import { getProfile } from "@/lib/profile/store";
import { getSearchSettings } from "@/lib/search/settings";

/** The most jobs in one email. Any others wait for the next one. */
export const DIGEST_LIMIT = 15;

export type DigestEmail = { to: string; subject: string; text: string };
export type DigestDeliver = (email: DigestEmail) => Promise<{ messageId: string }>;

export type DigestResult =
  | { status: "sent"; jobs: number; more: number }
  | { status: "nothing-new" }
  | { status: "not-configured"; message: string };

/** Your own Yahoo account sends it to you, unless DIGEST_TO names another address. */
export function digestRecipient(): string | null {
  return process.env.DIGEST_TO?.trim() || process.env.SMTP_USER?.trim() || null;
}

const deliverBySmtp: DigestDeliver = async ({ to, subject, text }) => {
  const { default: nodemailer } = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.mail.yahoo.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_APP_PASSWORD },
  });
  const info = await transport.sendMail({ from: { name: "Job matches", address: process.env.SMTP_USER! }, to, subject, text });
  return { messageId: info.messageId };
};

export type DigestJob = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  description: string;
  url: string;
  applyUrl: string | null;
  applyEmail: string | null;
  score: number;
  hasDraft: boolean;
};

export function digestText(
  jobs: DigestJob[],
  options: { more: number; minScore: number; dashboardUrl?: string; visaLocations: string[] },
): { subject: string; text: string } {
  const top = jobs[0]!;
  const subject =
    jobs.length === 1
      ? `New job match: ${top.score} · ${top.title} at ${top.company}`
      : `${jobs.length} new job matches · top ${top.score}: ${top.title} at ${top.company}`;

  const blocks = jobs.map((job, index) => {
    const lines = [`${index + 1}. ${job.score} · ${job.title}`, `   ${job.company}${job.location ? ` · ${job.location}` : ""}`];
    if (sponsorshipStatus(job, { visaSponsorshipLocations: options.visaLocations }) === "unmentioned") {
      lines.push("   Visa sponsorship isn't mentioned, so check before applying.");
    }
    if (job.applyEmail) lines.push(`   Email to apply: ${job.applyEmail}`);
    lines.push(`   Listing: ${job.applyUrl ?? job.url}`);
    if (job.hasDraft) lines.push("   A cover letter and CV are ready in the dashboard.");
    return lines.join("\n");
  });

  const footer = [
    options.more > 0 ? `${options.more} more scored ${options.minScore} or above. They'll come in the next email.` : "",
    options.dashboardUrl ? `Open the dashboard: ${options.dashboardUrl}` : "",
    `You get this email for new jobs scoring ${options.minScore} or above. You can change the minimum score in the dashboard's settings.`,
  ].filter(Boolean);

  return { subject, text: ["New jobs that match your profile, best first.", ...blocks, ...footer].join("\n\n") };
}

/**
 * Emails you the new jobs scoring at or above your minimum, best first. Each job is included once,
 * and is only marked as emailed after the email has gone, so a failure means it's tried again next time.
 */
export async function sendDigest(options: { deliver?: DigestDeliver; now?: Date } = {}): Promise<DigestResult> {
  const to = digestRecipient();
  if (!options.deliver && !(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD)) {
    return { status: "not-configured", message: "Set SMTP_USER and SMTP_APP_PASSWORD (a Yahoo app password) to get the daily email." };
  }
  if (!to) return { status: "not-configured", message: "There's no address to send the daily email to." };

  const [settings, stored] = await Promise.all([getSearchSettings(), getProfile()]);
  const candidates = await db().job.findMany({
    where: {
      notifiedAt: null,
      state: { not: "DISMISSED" },
      scores: { some: { modelVersion: { not: RULES_VERSION }, score: { gte: settings.minScore } } },
    },
    select: {
      id: true,
      title: true,
      company: true,
      location: true,
      description: true,
      url: true,
      applyUrl: true,
      applyEmail: true,
      application: { select: { submittedAt: true } },
      scores: { where: { modelVersion: { not: RULES_VERSION } }, orderBy: { createdAt: "desc" }, take: 1, select: { score: true } },
    },
  });

  // Judged on the latest score, so a job that has since dropped below your minimum isn't sent.
  const matches: DigestJob[] = candidates
    .filter((job) => !job.application?.submittedAt && (job.scores[0]?.score ?? 0) >= settings.minScore)
    .map(({ scores, application, ...job }) => ({ ...job, score: scores[0]!.score, hasDraft: Boolean(application) }))
    .sort((a, b) => b.score - a.score);
  if (!matches.length) return { status: "nothing-new" };

  const batch = matches.slice(0, DIGEST_LIMIT);
  const more = matches.length - batch.length;
  const { subject, text } = digestText(batch, {
    more,
    minScore: settings.minScore,
    dashboardUrl: process.env.DASHBOARD_URL?.trim() || undefined,
    visaLocations: stored?.profile.preferences.visaSponsorshipLocations ?? [],
  });

  await (options.deliver ?? deliverBySmtp)({ to, subject, text });
  await db().job.updateMany({ where: { id: { in: batch.map((job) => job.id) } }, data: { notifiedAt: options.now ?? new Date() } });
  await db().auditLog.create({ data: { action: "digest.sent", payload: { jobs: batch.length, more } } });
  return { status: "sent", jobs: batch.length, more };
}
