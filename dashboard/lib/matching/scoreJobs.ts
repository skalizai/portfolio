import Anthropic from "@anthropic-ai/sdk";
import { getStructuredCv, type ParseCall } from "@/lib/apply/parseCv";
import { db } from "@/lib/db";
import { llmModel } from "@/lib/llm";
import { hardFilter } from "@/lib/matching/filters";
import { keywordScore, matchesTargetTitle, MIN_KEYWORD_SCORE } from "@/lib/matching/keywordScore";
import { llmScore, type ScoreCall } from "@/lib/matching/llmScore";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getProfile } from "@/lib/profile/store";
import { getSearchSettings } from "@/lib/search/settings";

/** Marks a result that came from the free checks, not from Claude. */
export const RULES_VERSION = "rules";

const CONCURRENT_CALLS = 4;
// Leaves time for calls in progress to finish before the route's 120 second limit.
const STOP_STARTING_AFTER_MS = 55_000;

export type ScoreReport = {
  scored: number;
  ruledOut: number;
  /** Jobs still waiting for Claude after this run. */
  remaining: number;
  /** True when calling again straight away would make progress. */
  more: boolean;
  capReached: boolean;
  inputTokens: number;
  outputTokens: number;
  errors: string[];
};

function blockingError(error: unknown): string | null {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return "The Anthropic API key was rejected.";
  if (error instanceof Anthropic.RateLimitError) return "Claude is rate limited. The rest will be scored on the next run.";
  // Includes running out of credit, which the API reports as a bad request.
  if (error instanceof Anthropic.BadRequestError) return "Claude rejected the request. Check the credit balance on your Anthropic account.";
  return null;
}

export async function scoreNewJobs(options: { now?: Date; call?: ScoreCall; parse?: ParseCall } = {}): Promise<ScoreReport> {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const report: ScoreReport = { scored: 0, ruledOut: 0, remaining: 0, more: false, capReached: false, inputTokens: 0, outputTokens: 0, errors: [] };

  const stored = await getProfile();
  if (!stored) return { ...report, errors: ["Add your profile before scoring jobs."] };
  const { profile, updatedAt: profileUpdatedAt } = stored;
  const settings = await getSearchSettings();
  const model = llmModel();

  const jobs = await db().job.findMany({
    where: {
      state: { not: "DISMISSED" },
      application: { is: null },
      scores: { none: { profileUpdatedAt, modelVersion: { in: [model, RULES_VERSION] } } },
    },
    orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { fetchedAt: "desc" }],
    select: { id: true, title: true, company: true, location: true, workMode: true, employmentType: true, description: true, postedAt: true },
  });

  const ruledOut: Prisma.MatchScoreCreateManyInput[] = [];
  const candidates: typeof jobs = [];
  const base = { matchedSkills: [], missingSkills: [], keyRequirements: [], redFlags: [], verdict: "REJECT" as const, modelVersion: RULES_VERSION, profileUpdatedAt };

  for (const job of jobs) {
    const filtered = hardFilter(job, profile.preferences, settings.locations, now);
    const points = filtered ? 0 : keywordScore(job, profile);
    if (filtered) {
      ruledOut.push({ ...base, jobId: job.id, score: 0, seniorityFit: filtered.seniorityFit, locationFit: filtered.locationFit, reasoning: filtered.reason });
    } else if (points < MIN_KEYWORD_SCORE && !matchesTargetTitle(job.title, [...profile.targetTitles, ...settings.keywords])) {
      ruledOut.push({ ...base, jobId: job.id, score: points, seniorityFit: "fit", locationFit: true, reasoning: "Too few of your skills appear in this listing to be worth scoring." });
    } else {
      candidates.push(job);
    }
  }
  if (ruledOut.length) await db().matchScore.createMany({ data: ruledOut, skipDuplicates: true });
  report.ruledOut = ruledOut.length;

  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const usedToday = await db().matchScore.count({ where: { createdAt: { gte: dayStart }, modelVersion: { not: RULES_VERSION } } });
  const allowance = Math.max(0, settings.scoreDailyCap - usedToday);
  const queue = candidates.slice(0, allowance);
  report.capReached = candidates.length > allowance;

  const hasCaller = Boolean(options.call || process.env.ANTHROPIC_API_KEY);
  if (candidates.length && !hasCaller) {
    report.remaining = candidates.length;
    report.errors.push("ANTHROPIC_API_KEY isn't set, so jobs can't be scored yet.");
    await logRun(report, now);
    return report;
  }

  // Parsed only once, and only when there's something to score. Scoring still works without it.
  const education = queue.length ? ((await getStructuredCv(options.parse).catch(() => null))?.education ?? []) : [];

  let next = 0;
  let blocked = false;
  let failed = 0;
  const worker = async () => {
    while (next < queue.length && !blocked && Date.now() - startedAt < STOP_STARTING_AFTER_MS) {
      const job = queue[next++]!;
      try {
        const outcome = await llmScore(job, profile, options.call, education);
        report.inputTokens += outcome.inputTokens;
        report.outputTokens += outcome.outputTokens;
        const tokens = { inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens };

        if (outcome.kind === "scored") {
          await db().matchScore.createMany({
            data: [{ ...outcome.result, ...tokens, jobId: job.id, modelVersion: model, profileUpdatedAt }],
            skipDuplicates: true,
          });
          report.scored++;
        } else if (outcome.kind === "declined") {
          // Recorded so that the same listing isn't paid for again on every run.
          await db().matchScore.createMany({
            data: [{ ...base, ...tokens, jobId: job.id, score: 0, seniorityFit: "fit", locationFit: true, reasoning: "Claude declined to assess this listing, so check it yourself." }],
            skipDuplicates: true,
          });
          report.ruledOut++;
        } else {
          failed++;
        }
      } catch (error) {
        const blocking = blockingError(error);
        if (blocking) {
          blocked = true;
          if (!report.errors.includes(blocking)) report.errors.push(blocking);
        } else {
          failed++;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENT_CALLS }, worker));

  if (failed) report.errors.push(`${failed} ${failed === 1 ? "job" : "jobs"} couldn't be scored and will be tried again.`);
  report.remaining = candidates.length - report.scored - (report.ruledOut - ruledOut.length);
  // Only worth an immediate retry if time ran out. Failures wait for the next scheduled run.
  report.more = !blocked && next < queue.length;

  await logRun(report, now);
  return report;
}

async function logRun(report: ScoreReport, now: Date) {
  await db().auditLog.create({ data: { action: "jobs.score", at: now, payload: report } });
}
