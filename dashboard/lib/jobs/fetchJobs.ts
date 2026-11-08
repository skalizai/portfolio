import { db } from "@/lib/db";
import { dedupeHash, isFuzzyDuplicate } from "@/lib/dedupe";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getSearchSettings } from "@/lib/search/settings";
import { enabledSources, sourcesFromEnv } from "@/lib/sources";
import type { FetchContext, JobSource, NormalisedJob } from "@/lib/sources/types";

const AUDIT_ACTION = "jobs.fetch";
const FUZZY_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

type SourceReport = { requests: number; queries: string[]; fetched: number; skipped: number; errors: string[] };

export type FetchReport = {
  sources: Record<string, SourceReport>;
  inserted: number;
  duplicates: number;
  durationMs: number;
};

/** Counts past requests per source from the run log, which is what keeps searches inside the quota. */
async function requestUsage(now: Date): Promise<Record<string, FetchContext["usage"]>> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const runs = await db().auditLog.findMany({
    where: { action: AUDIT_ACTION, at: { gte: monthStart } },
    select: { at: true, payload: true },
  });

  const usage: Record<string, FetchContext["usage"]> = {};
  for (const run of runs) {
    const sources = (run.payload as { sources?: Record<string, { requests?: number }> } | null)?.sources ?? {};
    for (const [name, report] of Object.entries(sources)) {
      const entry = (usage[name] ??= { requestsThisMonth: 0, requestsToday: 0 });
      entry.requestsThisMonth += report.requests ?? 0;
      if (run.at >= dayStart) entry.requestsToday += report.requests ?? 0;
    }
  }
  return usage;
}

/** Stores new jobs, skipping exact and near matches both in the database and within this batch. */
async function storeJobs(jobs: NormalisedJob[], now: Date): Promise<{ inserted: number; duplicates: number }> {
  if (!jobs.length) return { inserted: 0, duplicates: 0 };

  const recent = await db().job.findMany({
    where: { fetchedAt: { gte: new Date(now.getTime() - FUZZY_LOOKBACK_MS) } },
    select: { company: true, title: true, location: true, fetchedAt: true },
  });
  const seen = recent.map(({ company, title, location, fetchedAt }) => ({ company, title, location, seenAt: fetchedAt }));

  const fresh: Prisma.JobCreateManyInput[] = [];
  for (const job of jobs) {
    const candidate = { company: job.company, title: job.title, location: job.location, seenAt: now };
    if (seen.some((other) => isFuzzyDuplicate(candidate, other))) continue;
    seen.push(candidate);
    fresh.push({
      ...job,
      rawJson: job.rawJson as Prisma.InputJsonValue,
      dedupeHash: dedupeHash(job),
      fetchedAt: now,
    });
  }

  // skipDuplicates covers exact matches older than the fuzzy window, and overlapping runs.
  const { count } = fresh.length ? await db().job.createMany({ data: fresh, skipDuplicates: true }) : { count: 0 };
  return { inserted: count, duplicates: jobs.length - count };
}

/** Runs every enabled source and records the run. One source failing doesn't stop the others. */
export async function runJobFetch(
  options: { sources?: JobSource[]; now?: Date; manualQuery?: FetchContext["manualQuery"] } = {},
): Promise<FetchReport> {
  const now = options.now ?? new Date();
  const startedAt = Date.now();
  const { keywords, locations, sourcesEnabled, sponsorshipRules } = await getSearchSettings();
  const usage = await requestUsage(now);
  const sources = options.sources ?? enabledSources(sourcesEnabled.length ? sourcesEnabled : sourcesFromEnv());

  const reports: Record<string, SourceReport> = {};
  const jobs: NormalisedJob[] = [];

  await Promise.all(
    sources.map(async (source) => {
      try {
        const result = await source.fetch({
          now,
          keywords,
          locations,
          visaLocations: sponsorshipRules,
          usage: usage[source.name] ?? { requestsThisMonth: 0, requestsToday: 0 },
          manualQuery: options.manualQuery,
        });
        jobs.push(...result.jobs);
        reports[source.name] = {
          requests: result.requests,
          queries: result.queries,
          fetched: result.jobs.length,
          skipped: result.skipped,
          errors: result.errors,
        };
      } catch {
        reports[source.name] = { requests: 0, queries: [], fetched: 0, skipped: 0, errors: [`${source.name} failed unexpectedly.`] };
      }
    }),
  );

  const { inserted, duplicates } = await storeJobs(jobs, now);
  const report: FetchReport = { sources: reports, inserted, duplicates, durationMs: Date.now() - startedAt };
  await db().auditLog.create({ data: { action: AUDIT_ACTION, at: now, payload: report } });
  return report;
}
