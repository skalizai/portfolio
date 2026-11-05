import { db } from "@/lib/db";
import { getSearchSettings } from "@/lib/search/settings";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_JOBS = 300;
const RESPONDED = ["INTERVIEW", "OFFER", "REJECTED"];

/** Everything the Matches page shows. Applications that are only drafted don't count as applied. */
export async function getJobsOverview(now = new Date()) {
  const [jobs, settings, submitted, lastRun] = await Promise.all([
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
        scores: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { score: true, verdict: true, matchedSkills: true, missingSkills: true, redFlags: true, reasoning: true, createdAt: true },
        },
      },
    }),
    getSearchSettings(),
    db().application.findMany({ where: { submittedAt: { not: null } }, select: { status: true, submittedAt: true } }),
    db().auditLog.findFirst({ where: { action: "jobs.fetch" }, orderBy: { at: "desc" }, select: { at: true } }),
  ]);

  const rows = jobs.map(({ scores, ...job }) => ({ ...job, match: scores[0] ?? null }));
  const matches = rows
    .filter((job) => job.match && job.match.score >= settings.minScore)
    .sort((a, b) => b.match!.score - a.match!.score);
  const below = rows.filter((job) => job.match && job.match.score < settings.minScore).sort((a, b) => b.match!.score - a.match!.score);
  const waiting = rows.filter((job) => !job.match);

  const dayAgo = now.getTime() - DAY_MS;
  const weekAgo = now.getTime() - 7 * DAY_MS;

  return {
    matches,
    below,
    waiting,
    minScore: settings.minScore,
    newMatches: matches.filter((job) => job.match!.createdAt.getTime() >= dayAgo).length,
    averageScore: matches.length ? Math.round(matches.reduce((sum, job) => sum + job.match!.score, 0) / matches.length) : null,
    applicationsThisWeek: submitted.filter((a) => a.submittedAt!.getTime() >= weekAgo).length,
    responseRate: submitted.length ? Math.round((100 * submitted.filter((a) => RESPONDED.includes(a.status)).length) / submitted.length) : null,
    lastSearchAt: lastRun?.at ?? null,
  };
}

export type JobsOverview = Awaited<ReturnType<typeof getJobsOverview>>;
export type JobRow = JobsOverview["matches"][number];
