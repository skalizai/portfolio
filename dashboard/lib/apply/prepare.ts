import Anthropic from "@anthropic-ai/sdk";
import { draftApplication, type DraftCall } from "@/lib/apply/draft";
import { getStructuredCv, type ParseCall } from "@/lib/apply/parseCv";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { sponsorshipStatus } from "@/lib/matching/filters";
import { RULES_VERSION } from "@/lib/matching/scoreJobs";
import { getProfile } from "@/lib/profile/store";
import { getSearchSettings } from "@/lib/search/settings";

const REPEAT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const STOP_STARTING_AFTER_MS = 150_000;

export type PrepareResult =
  | { jobId: string; status: "created" | "exists"; applicationId: string }
  | { jobId: string; status: "capped" | "failed"; message: string };

type Calls = { draft?: DraftCall; parse?: ParseCall };

const startOfDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** Prepares one job's draft, within today's limit. It never sends anything. */
export async function prepareDraft(jobId: string, options: Calls & { now?: Date } = {}): Promise<PrepareResult> {
  const now = options.now ?? new Date();
  const fail = (message: string): PrepareResult => ({ jobId, status: "failed", message });

  const job = await db().job.findUnique({ where: { id: jobId }, include: { application: { select: { id: true } } } });
  if (!job) return fail("That job no longer exists.");
  if (job.application) return { jobId, status: "exists", applicationId: job.application.id };

  if (!options.draft && !process.env.ANTHROPIC_API_KEY) return fail("ANTHROPIC_API_KEY isn't set, so drafts can't be prepared yet.");

  const settings = await getSearchSettings();
  const usedToday = await db().application.count({ where: { createdAt: { gte: startOfDay(now) } } });
  if (usedToday >= settings.draftDailyCap) {
    return { jobId, status: "capped", message: `Today's limit of ${settings.draftDailyCap} drafts is reached. You can raise it in Settings.` };
  }

  const stored = await getProfile();
  if (!stored) return fail("Add your profile before preparing drafts.");

  try {
    const cv = await getStructuredCv(options.parse);
    if (!cv) return fail("Your CV couldn't be read. Upload it on the Profile page, then try again.");

    const outcome = await draftApplication(job, stored.profile, cv, options.draft);
    if (outcome.kind === "failed") return fail(outcome.message);

    const repeat = await db().application.findFirst({
      where: {
        submittedAt: { gte: new Date(now.getTime() - REPEAT_WINDOW_MS) },
        job: { company: { equals: job.company, mode: "insensitive" }, title: { equals: job.title, mode: "insensitive" } },
      },
      select: { submittedAt: true },
    });

    const warnings = outcome.kind === "ok" ? outcome.warnings : [`There wasn't enough in your profile and CV to write an honest letter. Missing: ${outcome.missingInfo.join("; ") || "not stated"}.`];
    if (repeat) warnings.unshift("You've applied for this same title at this company in the last 30 days.");

    const created = await db().application.create({
      data: {
        jobId,
        channel: job.applyChannel,
        status: "DRAFT",
        coverLetter: outcome.kind === "ok" ? outcome.coverLetter : null,
        tailoredCv: outcome.tailoredCv as unknown as Prisma.InputJsonValue,
        draftWarnings: warnings,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        history: [{ at: now.toISOString(), action: "drafted" }],
      },
      select: { id: true },
    });
    await db().auditLog.create({ data: { action: "application.drafted", jobId, payload: { inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens, warnings: warnings.length } } });
    return { jobId, status: "created", applicationId: created.id };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return fail("The Anthropic API key was rejected.");
    if (error instanceof Anthropic.RateLimitError) return fail("Claude is rate limited. Try again in a minute.");
    if (error instanceof Anthropic.BadRequestError) return fail("Claude rejected the request. Check the credit balance on your Anthropic account.");
    if (error instanceof Anthropic.APIError) return fail("Claude couldn't prepare this draft. Please try again.");
    // Two requests can race to create the same draft. The database allows only one.
    const existing = await db().application.findUnique({ where: { jobId }, select: { id: true } });
    if (existing) return { jobId, status: "exists", applicationId: existing.id };
    throw error;
  }
}

/** The morning run: drafts for the best new matches, up to today's limit. */
export async function prepareNewMatches(options: Calls & { now?: Date } = {}): Promise<{ created: number; more: boolean; errors: string[] }> {
  const startedAt = Date.now();
  const settings = await getSearchSettings();
  const stored = await getProfile();
  if (!stored) return { created: 0, more: false, errors: ["Add your profile before preparing drafts."] };

  const jobs = await db().job.findMany({
    where: {
      state: { not: "DISMISSED" },
      application: { is: null },
      scores: { some: { score: { gte: settings.minScore }, modelVersion: { not: RULES_VERSION }, profileUpdatedAt: stored.updatedAt } },
    },
    select: { id: true, title: true, description: true, location: true, scores: { where: { profileUpdatedAt: stored.updatedAt }, orderBy: { score: "desc" }, take: 1, select: { score: true } } },
  });

  // Jobs that may not offer the sponsorship you need wait for you to choose them.
  const queue = jobs
    .filter((job) => sponsorshipStatus(job, stored.profile.preferences) !== "unmentioned")
    .sort((a, b) => (b.scores[0]?.score ?? 0) - (a.scores[0]?.score ?? 0));

  let created = 0;
  const errors: string[] = [];
  for (const job of queue) {
    if (Date.now() - startedAt > STOP_STARTING_AFTER_MS) return { created, more: true, errors };
    const result = await prepareDraft(job.id, options);
    if (result.status === "created") created++;
    if (result.status === "capped") break;
    if (result.status === "failed" && !errors.includes(result.message)) errors.push(result.message);
  }
  return { created, more: false, errors };
}
