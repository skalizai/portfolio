import { db } from "@/lib/db";
import { hiddenBySponsorshipRule, sponsorshipStatus, type SponsorshipPreferences } from "@/lib/matching/filters";
import { RULES_VERSION } from "@/lib/matching/scoreJobs";
import { getSearchSettings } from "@/lib/search/settings";

/** The most jobs in one email. Any others wait for the next one. */
export const DIGEST_LIMIT = 15;

export type DigestEmail = { to: string; subject: string; text: string };
export type DigestDeliver = (email: DigestEmail) => Promise<{ messageId: string }>;

export type DigestResult =
  | { status: "sent"; jobs: number; more: number }
  | { status: "nothing-new" }
  | { status: "not-configured"; message: string };

/** Goes to DIGEST_TO, or else to the address you sign in with. */
export function digestRecipient(): string | null {
  return process.env.DIGEST_TO?.trim() || process.env.AUTH_ALLOWED_EMAIL?.trim() || null;
}

/**
 * Sent through Resend. Without a verified domain of your own, Resend's shared sender address can
 * only write to the email your Resend account is registered with, which is all this needs.
 */
const deliverByResend: DigestDeliver = async ({ to, subject, text }) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.DIGEST_FROM?.trim() || "Job matches <onboarding@resend.dev>", to: [to], subject, text }),
  });
  // The error body is left out, so nothing about the account can end up in a log or response.
  if (!response.ok) throw new Error(`Resend answered ${response.status}`);
  const { id } = (await response.json()) as { id: string };
  return { messageId: id };
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
  options: { more: number; minScore: number; dashboardUrl?: string; sponsorship: SponsorshipPreferences },
): { subject: string; text: string } {
  const top = jobs[0]!;
  const subject =
    jobs.length === 1
      ? `New job match: ${top.score} · ${top.title} at ${top.company}`
      : `${jobs.length} new job matches · top ${top.score}: ${top.title} at ${top.company}`;

  const blocks = jobs.map((job, index) => {
    const lines = [`${index + 1}. ${job.score} · ${job.title}`, `   ${job.company}${job.location ? ` · ${job.location}` : ""}`];
    if (sponsorshipStatus(job, options.sponsorship) === "unmentioned") {
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
  if (!options.deliver && !process.env.RESEND_API_KEY) {
    return { status: "not-configured", message: "Set RESEND_API_KEY to get the daily email." };
  }
  if (!to) return { status: "not-configured", message: "There's no address to send the daily email to." };

  const settings = await getSearchSettings();
  const sponsorship = { visaSponsorshipLocations: settings.visaSponsorshipLocations, sponsorshipRules: settings.sponsorshipRules };
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
    .filter((job) => !job.application?.submittedAt && (job.scores[0]?.score ?? 0) >= settings.minScore && !hiddenBySponsorshipRule(job, sponsorship))
    .map(({ scores, application, ...job }) => ({ ...job, score: scores[0]!.score, hasDraft: Boolean(application) }))
    .sort((a, b) => b.score - a.score);
  if (!matches.length) return { status: "nothing-new" };

  const batch = matches.slice(0, DIGEST_LIMIT);
  const more = matches.length - batch.length;
  const { subject, text } = digestText(batch, {
    more,
    minScore: settings.minScore,
    dashboardUrl: process.env.DASHBOARD_URL?.trim() || undefined,
    sponsorship,
  });

  await (options.deliver ?? deliverByResend)({ to, subject, text });
  await db().job.updateMany({ where: { id: { in: batch.map((job) => job.id) } }, data: { notifiedAt: options.now ?? new Date() } });
  await db().auditLog.create({ data: { action: "digest.sent", payload: { jobs: batch.length, more } } });
  return { status: "sent", jobs: batch.length, more };
}
