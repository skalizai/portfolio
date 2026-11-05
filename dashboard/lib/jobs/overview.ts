import { isEmailConfigured } from "@/lib/apply/send";
import { db } from "@/lib/db";
import { sponsorshipStatus } from "@/lib/matching/filters";
import { RULES_VERSION } from "@/lib/matching/scoreJobs";
import { EMPTY_PROFILE } from "@/lib/profile/schema";
import { getProfile } from "@/lib/profile/store";
import { getSearchSettings } from "@/lib/search/settings";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_JOBS = 300;
const RESPONDED = ["INTERVIEW", "OFFER", "REJECTED"];

/** Everything the Matches page shows. Applications that are only drafted don't count as applied. */
export async function getJobsOverview(now = new Date()) {
  const [jobs, settings, stored, submitted, lastRun] = await Promise.all([
    db().job.findMany({
      where: { state: { not: "DISMISSED" } },
      orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { fetchedAt: "desc" }],
      take: MAX_JOBS,
      select: {
        id: true,
        title: true,
        company: true,
        location: true,
        workMode: true,
        employmentType: true,
        url: true,
        applyChannel: true,
        publisher: true,
        postedAt: true,
        state: true,
        description: true,
        applyEmail: true,
        application: { select: { id: true, submittedAt: true, sendAt: true, coverLetter: true, draftWarnings: true } },
        scores: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { score: true, verdict: true, matchedSkills: true, missingSkills: true, redFlags: true, reasoning: true, createdAt: true, modelVersion: true },
        },
      },
    }),
    getSearchSettings(),
    getProfile(),
    db().application.findMany({ where: { submittedAt: { not: null } }, select: { status: true, submittedAt: true } }),
    db().auditLog.findFirst({ where: { action: "jobs.fetch" }, orderBy: { at: "desc" }, select: { at: true } }),
  ]);

  const preferences = stored?.profile.preferences ?? EMPTY_PROFILE.preferences;

  // Descriptions are long, so they're only used here and aren't sent to the browser.
  const rows = jobs.map(({ scores, description, application, ...job }) => ({
    ...job,
    match: scores[0] ?? null,
    application: application
      ? {
          id: application.id,
          submitted: application.submittedAt !== null,
          sendAt: application.sendAt,
          // Whether Approve all may include this: an email job with a finished draft and nothing to check.
          approvable: job.applyChannel === "EMAIL" && Boolean(job.applyEmail && application.coverLetter?.trim()) && !application.submittedAt && !application.sendAt && !application.draftWarnings.length,
        }
      : null,
    sponsorshipUnmentioned: sponsorshipStatus({ title: job.title, location: job.location, description }, preferences) === "unmentioned",
  }));

  const byScore = <T extends { match: { score: number } | null }>(a: T, b: T) => (b.match?.score ?? 0) - (a.match?.score ?? 0);
  const scored = rows.filter((job) => job.match);
  const needsAsking = scored.filter((job) => job.sponsorshipUnmentioned && job.match!.modelVersion !== RULES_VERSION);
  const others = scored.filter((job) => !needsAsking.includes(job));

  const matches = others.filter((job) => job.match!.score >= settings.minScore).sort(byScore);
  const dayAgo = now.getTime() - DAY_MS;
  const weekAgo = now.getTime() - 7 * DAY_MS;

  return {
    matches,
    sponsorshipUnknown: needsAsking.sort(byScore),
    below: others.filter((job) => job.match!.score < settings.minScore).sort(byScore),
    waiting: rows.filter((job) => !job.match),
    minScore: settings.minScore,
    emailReady: isEmailConfigured(),
    newMatches: matches.filter((job) => job.match!.createdAt.getTime() >= dayAgo).length,
    averageScore: matches.length ? Math.round(matches.reduce((sum, job) => sum + job.match!.score, 0) / matches.length) : null,
    applicationsThisWeek: submitted.filter((a) => a.submittedAt!.getTime() >= weekAgo).length,
    responseRate: submitted.length ? Math.round((100 * submitted.filter((a) => RESPONDED.includes(a.status)).length) / submitted.length) : null,
    lastSearchAt: lastRun?.at ?? null,
  };
}

export type JobsOverview = Awaited<ReturnType<typeof getJobsOverview>>;
export type JobRow = JobsOverview["matches"][number];
