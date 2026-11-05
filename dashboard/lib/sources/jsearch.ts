import { z } from "zod";
import { detectChannel, safeUrl } from "@/lib/apply/channelDetect";
import type { FetchContext, FetchResult, JobSource, NormalisedJob } from "@/lib/sources/types";

const HOST = "jsearch.p.rapidapi.com";
const DEFAULT_MONTHLY_LIMIT = 200;
// One run a day, so this is close to a 30th of the monthly allowance.
const DEFAULT_REQUESTS_PER_RUN = 7;
// Leaves time for the last request to finish before the route's 120 second limit.
const STOP_STARTING_AFTER_MS = 80_000;

const COUNTRIES: Record<string, { country: string; label: string }> = {
  dubai: { country: "ae", label: "UAE" },
  "abu dhabi": { country: "ae", label: "UAE" },
  sharjah: { country: "ae", label: "UAE" },
  uae: { country: "ae", label: "UAE" },
  "united arab emirates": { country: "ae", label: "UAE" },
  "saudi arabia": { country: "sa", label: "Saudi Arabia" },
  ksa: { country: "sa", label: "Saudi Arabia" },
  riyadh: { country: "sa", label: "Saudi Arabia" },
  qatar: { country: "qa", label: "Qatar" },
  doha: { country: "qa", label: "Qatar" },
  oman: { country: "om", label: "Oman" },
  muscat: { country: "om", label: "Oman" },
  bahrain: { country: "bh", label: "Bahrain" },
  kuwait: { country: "kw", label: "Kuwait" },
  "united kingdom": { country: "gb", label: "United Kingdom" },
  uk: { country: "gb", label: "United Kingdom" },
  germany: { country: "de", label: "Germany" },
  netherlands: { country: "nl", label: "Netherlands" },
  singapore: { country: "sg", label: "Singapore" },
  india: { country: "in", label: "India" },
  canada: { country: "ca", label: "Canada" },
  australia: { country: "au", label: "Australia" },
  "new zealand": { country: "nz", label: "New Zealand" },
};

const nullableString = z.string().nullish();
const nullableNumber = z.number().nullish();

const JSearchJob = z.object({
  job_id: z.string().min(1),
  job_title: z.string().min(1),
  employer_name: z.string().min(1),
  job_publisher: nullableString,
  job_employment_type: nullableString,
  job_apply_link: nullableString,
  job_google_link: nullableString,
  job_description: nullableString,
  job_is_remote: z.boolean().nullish(),
  job_posted_at_datetime_utc: nullableString,
  job_location: nullableString,
  job_city: nullableString,
  job_state: nullableString,
  job_country: nullableString,
  job_min_salary: nullableNumber,
  job_max_salary: nullableNumber,
  job_salary_currency: nullableString,
  apply_options: z
    .array(z.object({ apply_link: nullableString, is_direct: z.boolean().nullish() }))
    .nullish(),
});

const JSearchResponse = z.object({ status: z.string().optional(), data: z.object({ jobs: z.array(z.unknown()) }) });

export type SearchQuery = { query: string; country?: string };

/** One search per title and region. Dubai, Abu Dhabi and UAE all search the same market. */
export function buildQueries(keywords: string[], locations: string[]): SearchQuery[] {
  const regions = new Map<string, { label: string; country?: string }>();
  for (const location of locations) {
    const known = COUNTRIES[location.trim().toLowerCase()];
    if (known) regions.set(known.label, known);
    else regions.set(location.trim(), { label: location.trim() });
  }

  const unique = [...new Map(keywords.map((keyword) => [keyword.trim().toLowerCase(), keyword.trim()])).values()];
  return unique.flatMap((keyword) =>
    [...regions.values()].map(({ label, country }) => ({
      query: label.toLowerCase() === "remote" ? `${keyword} remote` : `${keyword} in ${label}`,
      ...(country ? { country } : {}),
    })),
  );
}

/**
 * How many requests this run may make. Spreads the remaining monthly quota evenly over the
 * remaining days, so an early burst can't leave the end of the month with no searches.
 */
export function allowedRequests(input: {
  now: Date;
  requestsThisMonth: number;
  requestsToday: number;
  monthlyLimit: number;
  perRun: number;
}): number {
  const { now, requestsThisMonth, requestsToday, monthlyLimit, perRun } = input;
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const daysLeft = daysInMonth - now.getUTCDate() + 1;
  const remainingAtDayStart = monthlyLimit - (requestsThisMonth - requestsToday);
  const todaysShare = Math.ceil(remainingAtDayStart / daysLeft);
  return Math.max(0, Math.min(perRun, todaysShare - requestsToday, monthlyLimit - requestsThisMonth));
}

/** Continues from where the last run stopped, so every search gets its turn. */
export function requestsPerDayFromEnv(): number {
  const monthlyLimit = Number(process.env.JSEARCH_MONTHLY_REQUEST_LIMIT) || DEFAULT_MONTHLY_LIMIT;
  const perRun = Number(process.env.JSEARCH_MAX_REQUESTS_PER_RUN) || DEFAULT_REQUESTS_PER_RUN;
  return Math.max(1, Math.min(perRun, Math.floor(monthlyLimit / 31)));
}

/** How many days it takes for every search to get a turn. */
export function searchCycleDays(searches: number, requestsPerDay: number): number {
  return Math.ceil(searches / Math.max(1, requestsPerDay));
}

export function nextQueries(queries: SearchQuery[], requestsSoFar: number, count: number): SearchQuery[] {
  if (!queries.length) return [];
  return Array.from({ length: Math.min(count, queries.length) }, (_, i) => queries[(requestsSoFar + i) % queries.length]!);
}

const EMPLOYMENT_TYPES: Record<string, string> = {
  FULLTIME: "full-time",
  PARTTIME: "part-time",
  CONTRACTOR: "contract",
  INTERN: "internship",
};

function workModeOf(isRemote: boolean | null | undefined, description: string): string | null {
  if (isRemote) return "remote";
  return /\bhybrid\b/i.test(description) ? "hybrid" : null;
}

/** Postgres can't store null characters, and third-party data occasionally contains them. */
const clean = (value: string) => value.replaceAll("\u0000", "");
const whole = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null);

export function normaliseJSearchJob(raw: unknown): NormalisedJob | null {
  const parsed = JSearchJob.safeParse(raw);
  if (!parsed.success) return null;
  const job = parsed.data;

  const description = clean(job.job_description ?? "");
  const directFirst = [...(job.apply_options ?? [])].sort((a, b) => Number(!!b.is_direct) - Number(!!a.is_direct));
  const { applyChannel, applyUrl, applyEmail } = detectChannel({
    description,
    applyUrls: [...directFirst.map((o) => o.apply_link), job.job_apply_link],
  });

  const url = safeUrl(job.job_apply_link) ?? safeUrl(job.job_google_link) ?? applyUrl;
  if (!url) return null;

  const postedAt = job.job_posted_at_datetime_utc ? new Date(job.job_posted_at_datetime_utc) : null;
  const location = job.job_location ?? ([job.job_city, job.job_state, job.job_country].filter(Boolean).join(", ") || null);

  return {
    source: "jsearch",
    sourceJobId: job.job_id,
    publisher: job.job_publisher ?? null,
    title: clean(job.job_title),
    company: clean(job.employer_name),
    location: location ? clean(location) : null,
    workMode: workModeOf(job.job_is_remote, description),
    employmentType: job.job_employment_type ? (EMPLOYMENT_TYPES[job.job_employment_type.toUpperCase().replace(/[^A-Z]/g, "")] ?? job.job_employment_type.toLowerCase()) : null,
    description,
    url,
    applyUrl,
    applyEmail,
    applyChannel,
    salaryMin: whole(job.job_min_salary),
    salaryMax: whole(job.job_max_salary),
    currency: job.job_salary_currency ?? null,
    postedAt: postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
    rawJson: JSON.parse(JSON.stringify(raw).replaceAll("\\u0000", "")),
  };
}

function describeFailure(status: number): string {
  if (status === 429) return "JSearch rate limit or quota reached (429).";
  if (status === 404) return "JSearch no longer recognises this endpoint (404).";
  if (status === 401 || status === 403) return `JSearch rejected the key, or you aren't subscribed (${status}).`;
  return `JSearch returned an error (${status}).`;
}

export function jsearchSource(fetchImpl: typeof fetch = fetch): JobSource {
  return {
    name: "jsearch",
    isConfigured: () => Boolean(process.env.RAPIDAPI_KEY),

    async fetch(context: FetchContext): Promise<FetchResult> {
      const monthlyLimit = Number(process.env.JSEARCH_MONTHLY_REQUEST_LIMIT) || DEFAULT_MONTHLY_LIMIT;
      const perRun = Number(process.env.JSEARCH_MAX_REQUESTS_PER_RUN) || DEFAULT_REQUESTS_PER_RUN;
      const { requestsThisMonth, requestsToday } = context.usage;

      const queries = context.manualQuery
        ? monthlyLimit > requestsThisMonth
          ? [context.manualQuery]
          : []
        : nextQueries(
            buildQueries(context.keywords, context.locations),
            requestsThisMonth,
            allowedRequests({ now: context.now, requestsThisMonth, requestsToday, monthlyLimit, perRun }),
          );

      const result: FetchResult = { jobs: [], requests: 0, queries: [], skipped: 0, errors: [] };

      const startedAt = Date.now();
      for (const { query, country } of queries) {
        // The rotation picks up from here on the next run, so nothing is lost by stopping.
        if (Date.now() - startedAt > STOP_STARTING_AFTER_MS) break;
        const url = new URL(`https://${HOST}/search-v2`);
        url.search = new URLSearchParams({ query, language: "en", date_posted: "month", ...(country ? { country } : {}) }).toString();

        result.requests++;
        result.queries.push(query);

        try {
          const response = await fetchImpl(url, {
            headers: { "x-rapidapi-key": process.env.RAPIDAPI_KEY ?? "", "x-rapidapi-host": HOST },
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) {
            result.errors.push(describeFailure(response.status));
            // Further requests would fail the same way and could use up more quota.
            if ([401, 403, 404, 429].includes(response.status)) break;
            continue;
          }

          const body = JSearchResponse.safeParse(await response.json());
          if (!body.success) {
            result.errors.push("JSearch returned a response in an unexpected format.");
            continue;
          }
          for (const raw of body.data.data.jobs) {
            const job = normaliseJSearchJob(raw);
            if (job) result.jobs.push(job);
            else result.skipped++;
          }
        } catch (error) {
          const timedOut = error instanceof Error && error.name === "TimeoutError";
          result.errors.push(timedOut ? "JSearch timed out." : "Couldn't reach JSearch.");
        }
      }

      return result;
    },
  };
}
