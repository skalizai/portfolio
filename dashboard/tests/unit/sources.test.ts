import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { channelForUrl, detectChannel, findApplyEmail, safeUrl } from "@/lib/apply/channelDetect";
import { dedupeHash, isFuzzyDuplicate, titleSimilarity } from "@/lib/dedupe";
import { allowedRequests, buildQueries, jsearchSource, nextQueries, normaliseJSearchJob, requestsPerDayFromEnv, searchCycleDays } from "@/lib/sources/jsearch";
import type { FetchContext } from "@/lib/sources/types";

const RAW = {
  job_id: "abc",
  job_title: "SAP CPI Architect",
  employer_name: "Acme LLC",
  job_publisher: "LinkedIn",
  job_employment_type: "FULLTIME",
  job_apply_link: "https://www.linkedin.com/jobs/view/1",
  job_description: "Lead our integration work.",
  job_is_remote: false,
  job_posted_at_datetime_utc: "2026-11-01T08:00:00.000Z",
  job_location: "Dubai, UAE",
  job_min_salary: 1000.6,
  job_max_salary: null,
};

describe("safeUrl", () => {
  it("keeps web links and drops anything else", () => {
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,x")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl(null)).toBeNull();
  });
});

describe("findApplyEmail", () => {
  it("finds an address the posting asks you to apply to", () => {
    expect(findApplyEmail("Please send your CV to Jobs@Acme.com today")).toBe("jobs@acme.com");
  });

  it("ignores addresses mentioned for other reasons", () => {
    expect(findApplyEmail("Our office manager is sam@acme.com and is very friendly.")).toBeNull();
    expect(findApplyEmail("To apply email noreply@acme.com")).toBeNull();
    expect(findApplyEmail("Send your CV to you@example.com")).toBeNull();
    expect(findApplyEmail("No addresses here")).toBeNull();
  });
});

describe("channel detection", () => {
  it.each([
    ["https://boards.greenhouse.io/acme/jobs/1", "ATS_FORM"],
    ["https://jobs.lever.co/acme/1", "ATS_FORM"],
    ["https://acme.wd3.myworkdayjobs.com/x", "ATS_FORM"],
    ["https://www.linkedin.com/jobs/view/1", "LINKEDIN_EASY_APPLY"],
    ["https://www.bayt.com/en/job/1", "UNKNOWN"],
    ["https://careers.acme.com/1", "COMPANY_SITE"],
    ["https://notlinkedin.com/jobs", "COMPANY_SITE"],
    [null, "UNKNOWN"],
  ])("classifies %s as %s", (url, channel) => {
    expect(channelForUrl(url)).toBe(channel);
  });

  it("prefers the employer's own systems over LinkedIn and job boards", () => {
    const result = detectChannel({
      description: "",
      applyUrls: ["https://www.indeed.com/1", "https://www.linkedin.com/jobs/view/1", "https://jobs.lever.co/acme/1"],
    });
    expect(result).toMatchObject({ applyChannel: "ATS_FORM", applyUrl: "https://jobs.lever.co/acme/1" });
  });

  it("uses email when the posting gives an address, and keeps the link as well", () => {
    const result = detectChannel({ description: "Send your CV to hr@acme.com", applyUrls: ["https://careers.acme.com/1"] });
    expect(result).toEqual({ applyChannel: "EMAIL", applyUrl: "https://careers.acme.com/1", applyEmail: "hr@acme.com" });
  });

  it("never stores an unsafe apply link", () => {
    expect(detectChannel({ description: "", applyUrls: ["javascript:alert(1)"] })).toEqual({
      applyChannel: "UNKNOWN",
      applyUrl: null,
      applyEmail: null,
    });
  });
});

describe("dedupe", () => {
  const job = { company: "Acme LLC", title: "SAP CPI Architect", location: "Dubai, UAE" };

  it("gives the same hash despite case, punctuation and company suffixes", () => {
    expect(dedupeHash(job)).toBe(dedupeHash({ company: "ACME", title: "SAP CPI  architect!", location: "dubai uae" }));
  });

  it("gives different hashes for different jobs", () => {
    expect(dedupeHash(job)).not.toBe(dedupeHash({ ...job, title: "SAP Basis Lead" }));
    expect(dedupeHash(job)).not.toBe(dedupeHash({ ...job, location: "Riyadh" }));
  });

  it("scores title similarity by shared words", () => {
    expect(titleSimilarity("SAP Technical Architect", "SAP Technical Architect (S/4HANA)")).toBeGreaterThanOrEqual(0.85);
    expect(titleSimilarity("SAP ABAP Lead", "SAP Basis Lead")).toBeLessThan(0.85);
    expect(titleSimilarity("", "SAP")).toBe(0);
  });

  const at = (day: number) => new Date(Date.UTC(2026, 10, day));
  const a = { company: "Acme LLC", title: "SAP Technical Architect", location: "Dubai", seenAt: at(1) };

  it("treats reworded listings from one company as the same job", () => {
    expect(isFuzzyDuplicate(a, { ...a, company: "Acme", title: "SAP Technical Architect (S/4HANA)", location: "Dubai, UAE", seenAt: at(10) })).toBe(true);
    expect(isFuzzyDuplicate(a, { ...a, location: null })).toBe(true);
  });

  it("keeps listings apart when the company, city, role or date differs", () => {
    expect(isFuzzyDuplicate(a, { ...a, company: "Other" })).toBe(false);
    expect(isFuzzyDuplicate(a, { ...a, location: "Riyadh" })).toBe(false);
    expect(isFuzzyDuplicate(a, { ...a, title: "SAP Basis Administrator" })).toBe(false);
    expect(isFuzzyDuplicate(a, { ...a, seenAt: at(20) })).toBe(false);
  });
});

describe("buildQueries", () => {
  it("merges places in the same market and sets the country", () => {
    expect(buildQueries(["SAP Lead"], ["Dubai", "Abu Dhabi", "UAE", "Saudi Arabia", "Qatar", "Remote"])).toEqual([
      { query: "SAP Lead in UAE", country: "ae" },
      { query: "SAP Lead in Saudi Arabia", country: "sa" },
      { query: "SAP Lead in Qatar", country: "qa" },
      { query: "SAP Lead remote" },
    ]);
  });

  it("returns nothing without keywords or locations", () => {
    expect(buildQueries([], ["Dubai"])).toEqual([]);
    expect(buildQueries(["SAP"], [])).toEqual([]);
  });
});

describe("request pacing", () => {
  const now = new Date(Date.UTC(2026, 10, 1)); // 30 days in this month
  const base = { now, requestsThisMonth: 0, requestsToday: 0, monthlyLimit: 200, perRun: 1 };

  it("allows a request within the daily share", () => {
    expect(allowedRequests(base)).toBe(1);
  });

  it("stops once the daily share is used", () => {
    expect(allowedRequests({ ...base, requestsThisMonth: 7, requestsToday: 7 })).toBe(0);
  });

  it("never goes over the monthly limit, even on the last day", () => {
    const lastDay = new Date(Date.UTC(2026, 10, 30));
    expect(allowedRequests({ ...base, now: lastDay, requestsThisMonth: 200 })).toBe(0);
    expect(allowedRequests({ ...base, now: lastDay, requestsThisMonth: 199, perRun: 5 })).toBe(1);
    expect(allowedRequests({ ...base, requestsThisMonth: 250 })).toBe(0);
  });

  it("stays within the limit across a whole month of 2-hourly runs", () => {
    let total = 0;
    for (let day = 1; day <= 30; day++) {
      let today = 0;
      for (let run = 0; run < 12; run++) {
        const allowed = allowedRequests({
          now: new Date(Date.UTC(2026, 10, day)),
          requestsThisMonth: total,
          requestsToday: today,
          monthlyLimit: 200,
          perRun: 1,
        });
        total += allowed;
        today += allowed;
      }
    }
    expect(total).toBeLessThanOrEqual(200);
    expect(total).toBeGreaterThan(190);
  });

  it("works through every search in turn", () => {
    const queries = [{ query: "a" }, { query: "b" }, { query: "c" }];
    expect(nextQueries(queries, 0, 1)).toEqual([{ query: "a" }]);
    expect(nextQueries(queries, 4, 1)).toEqual([{ query: "b" }]);
    expect(nextQueries(queries, 2, 2)).toEqual([{ query: "c" }, { query: "a" }]);
    expect(nextQueries(queries, 0, 9)).toHaveLength(3);
    expect(nextQueries([], 0, 1)).toEqual([]);
  });
});

describe("normaliseJSearchJob", () => {
  it("converts a JSearch record", () => {
    expect(normaliseJSearchJob(RAW)).toMatchObject({
      source: "jsearch",
      sourceJobId: "abc",
      publisher: "LinkedIn",
      company: "Acme LLC",
      location: "Dubai, UAE",
      employmentType: "full-time",
      applyChannel: "LINKEDIN_EASY_APPLY",
      salaryMin: 1001,
      salaryMax: null,
      postedAt: new Date("2026-11-01T08:00:00.000Z"),
    });
  });

  it("uses the employer's direct link from the apply options", () => {
    const job = normaliseJSearchJob({
      ...RAW,
      apply_options: [
        { apply_link: "https://www.linkedin.com/jobs/view/1", is_direct: false },
        { apply_link: "https://boards.greenhouse.io/acme/1", is_direct: true },
      ],
    });
    expect(job).toMatchObject({ applyChannel: "ATS_FORM", applyUrl: "https://boards.greenhouse.io/acme/1" });
  });

  it("removes null characters, which Postgres can't store", () => {
    const job = normaliseJSearchJob({ ...RAW, job_description: "a\u0000b", extra: "c\u0000d" });
    expect(job?.description).toBe("ab");
    expect(JSON.stringify(job?.rawJson)).not.toContain("\\u0000");
  });

  it("detects remote and hybrid work", () => {
    expect(normaliseJSearchJob({ ...RAW, job_is_remote: true })?.workMode).toBe("remote");
    expect(normaliseJSearchJob({ ...RAW, job_description: "A hybrid role" })?.workMode).toBe("hybrid");
    expect(normaliseJSearchJob(RAW)?.workMode).toBeNull();
  });

  it("rejects unusable records", () => {
    expect(normaliseJSearchJob({ job_id: "x" })).toBeNull();
    expect(normaliseJSearchJob({ ...RAW, employer_name: "" })).toBeNull();
    expect(normaliseJSearchJob({ ...RAW, job_apply_link: "javascript:alert(1)" })).toBeNull();
    expect(normaliseJSearchJob({ ...RAW, job_posted_at_datetime_utc: "nonsense" })?.postedAt).toBeNull();
  });
});

describe("jsearchSource", () => {
  const context: FetchContext = {
    now: new Date(Date.UTC(2026, 10, 1)),
    keywords: ["SAP Lead"],
    locations: ["Dubai", "Qatar"],
    usage: { requestsThisMonth: 1, requestsToday: 0 },
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    vi.stubEnv("RAPIDAPI_KEY", "secret-key");
    vi.stubEnv("JSEARCH_MAX_REQUESTS_PER_RUN", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls the next search in the rotation, with the key in a header only", async () => {
    const fetchMock = vi.fn(async () => json({ status: "OK", data: { jobs: [RAW, { job_id: "broken" }], cursor: null } }));
    const result = await jsearchSource(fetchMock as unknown as typeof fetch).fetch(context);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("query")).toBe("SAP Lead in Qatar");
    expect(url.pathname).toBe("/search-v2");
    expect(url.searchParams.get("country")).toBe("qa");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.toString()).not.toContain("secret-key");
    expect(init.headers).toMatchObject({ "x-rapidapi-key": "secret-key" });

    expect(result).toMatchObject({ requests: 1, skipped: 1, errors: [], queries: ["SAP Lead in Qatar"] });
    expect(result.jobs).toHaveLength(1);
  });

  it("makes no request once the monthly quota is used", async () => {
    const fetchMock = vi.fn();
    const result = await jsearchSource(fetchMock as unknown as typeof fetch).fetch({
      ...context,
      usage: { requestsThisMonth: 200, requestsToday: 0 },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.requests).toBe(0);
  });

  it("runs a specific search when asked, but still respects the monthly quota", async () => {
    const fetchMock = vi.fn(async () => json({ data: { jobs: [], cursor: null } }));
    const source = jsearchSource(fetchMock as unknown as typeof fetch);
    const manualQuery = { query: "SAP CPI Architect Dubai", country: "ae" };

    expect((await source.fetch({ ...context, manualQuery })).queries).toEqual([manualQuery.query]);
    expect((await source.fetch({ ...context, manualQuery, usage: { requestsThisMonth: 200, requestsToday: 0 } })).requests).toBe(0);
  });

  it("stops after a rate limit or rejected key and reports it without the key", async () => {
    vi.stubEnv("JSEARCH_MAX_REQUESTS_PER_RUN", "5");
    for (const status of [429, 401, 403, 404]) {
      const fetchMock = vi.fn(async () => json({}, status));
      const result = await jsearchSource(fetchMock as unknown as typeof fetch).fetch(context);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.errors[0]).toContain(String(status));
      expect(result.errors[0]).not.toContain("secret-key");
    }
  });

  it("reports malformed responses and network failures", async () => {
    const bad = await jsearchSource((async () => json({ nope: true })) as unknown as typeof fetch).fetch(context);
    expect(bad.errors[0]).toContain("unexpected format");

    const down = await jsearchSource((async () => {
      throw new Error("connection refused with secret-key");
    }) as unknown as typeof fetch).fetch(context);
    expect(down.errors).toEqual(["Couldn't reach JSearch."]);
  });

  it("only counts as configured when the key is set", () => {
    expect(jsearchSource().isConfigured()).toBe(true);
    vi.stubEnv("RAPIDAPI_KEY", "");
    expect(jsearchSource().isConfigured()).toBe(false);
  });
});

describe("JSearch employment types", () => {
  it.each([
    ["Full-time", "full-time"],
    ["FULLTIME", "full-time"],
    ["Contractor", "contract"],
    ["Part-time", "part-time"],
  ])("reads %s as %s", (given, expected) => {
    const job = normaliseJSearchJob({
      job_id: "1",
      job_title: "SAP Lead",
      employer_name: "Acme",
      job_apply_link: "https://acme.example/jobs/1",
      job_employment_type: given,
    });
    expect(job?.employmentType).toBe(expected);
  });
});

describe("morning search pacing", () => {
  it("fits the monthly allowance and reports how long a full rotation takes", () => {
    vi.stubEnv("JSEARCH_MONTHLY_REQUEST_LIMIT", "200");
    vi.stubEnv("JSEARCH_MAX_REQUESTS_PER_RUN", "7");
    expect(requestsPerDayFromEnv()).toBe(6);
    expect(searchCycleDays(28, 6)).toBe(5);
    vi.unstubAllEnvs();
  });

  it("looks for sponsorship only in the places that need it", () => {
    expect(buildQueries(["SAP Lead"], ["Dubai", "New Zealand", "Remote"], ["New Zealand"])).toEqual([
      { query: "SAP Lead in UAE", country: "ae" },
      { query: "SAP Lead visa sponsorship in New Zealand", country: "nz" },
      { query: "SAP Lead remote" },
    ]);
  });

  it("searches a repeated keyword only once", () => {
    expect(buildQueries(["SAP Lead", "sap lead "], ["New Zealand"])).toEqual([{ query: "SAP Lead in New Zealand", country: "nz" }]);
  });

  it("sets the country for places added in settings", () => {
    expect(buildQueries(["SAP Lead"], ["Oman", "Muscat"])).toEqual([{ query: "SAP Lead in Oman", country: "om" }]);
  });
});
