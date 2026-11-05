import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NormalisedJob } from "@/lib/sources/types";
import type { JobSource } from "@/lib/sources/types";

const PORT = 5545;
let server: PGLiteSocketServer;
let pg: PGlite;

// Imported after DATABASE_URL points at the in-memory database, so tests can't reach the real one.
let runJobFetch: typeof import("@/lib/jobs/fetchJobs").runJobFetch;
let db: typeof import("@/lib/db").db;

const NOW = new Date(Date.UTC(2026, 10, 5, 12));

function job(overrides: Partial<NormalisedJob> = {}): NormalisedJob {
  return {
    source: "test",
    sourceJobId: "1",
    publisher: "LinkedIn",
    title: "SAP CPI Architect",
    company: "Acme LLC",
    location: "Dubai, UAE",
    workMode: null,
    employmentType: "full-time",
    description: "Lead integration.",
    url: "https://example.com/1",
    applyUrl: "https://example.com/1",
    applyEmail: null,
    applyChannel: "COMPANY_SITE",
    salaryMin: null,
    salaryMax: null,
    currency: null,
    postedAt: new Date(Date.UTC(2026, 10, 1)),
    rawJson: { any: "thing" },
    ...overrides,
  };
}

function source(name: string, jobs: NormalisedJob[], requests = 1): JobSource {
  return {
    name,
    isConfigured: () => true,
    fetch: async () => ({ jobs, requests, queries: ["q"], skipped: 0, errors: [] }),
  };
}

beforeAll(async () => {
  pg = await PGlite.create();
  const dirs = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) await pg.exec(readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8"));
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 20 });
  await server.start();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;
  ({ runJobFetch } = await import("@/lib/jobs/fetchJobs"));
  ({ db } = await import("@/lib/db"));
});

afterAll(async () => {
  await db().$disconnect();
  await server.stop();
  await pg.close();
});

beforeEach(async () => {
  await pg.exec('TRUNCATE "jobmatch"."Job", "jobmatch"."AuditLog" CASCADE');
});

describe("runJobFetch", () => {
  it("stores jobs with a hash and logs the run", async () => {
    const report = await runJobFetch({ sources: [source("test", [job()])], now: NOW });

    expect(report).toMatchObject({ inserted: 1, duplicates: 0 });
    const [stored] = await db().job.findMany();
    expect(stored).toMatchObject({ title: "SAP CPI Architect", state: "ACTIVE", publisher: "LinkedIn" });
    expect(stored?.dedupeHash).toHaveLength(64);

    const log = await db().auditLog.findFirst({ where: { action: "jobs.fetch" } });
    expect(log?.payload).toMatchObject({ inserted: 1, sources: { test: { requests: 1, fetched: 1 } } });
  });

  it("de-duplicates across two sources in the same run", async () => {
    const report = await runJobFetch({
      sources: [
        source("a", [job({ source: "a" })]),
        source("b", [
          job({ source: "b", company: "ACME", title: "SAP CPI Architect (S/4HANA)" }),
          job({ source: "b", sourceJobId: "2", title: "SAP Basis Administrator" }),
        ]),
      ],
      now: NOW,
    });
    expect(report).toMatchObject({ inserted: 2, duplicates: 1 });
    expect(await db().job.count()).toBe(2);
  });

  it("doesn't store a job again on the next run", async () => {
    await runJobFetch({ sources: [source("test", [job()])], now: NOW });
    const second = await runJobFetch({ sources: [source("test", [job()])], now: new Date(NOW.getTime() + 7_200_000) });
    expect(second).toMatchObject({ inserted: 0, duplicates: 1 });
    expect(await db().job.count()).toBe(1);
  });

  it("skips an exact repeat even after the 14-day window", async () => {
    await runJobFetch({ sources: [source("test", [job()])], now: NOW });
    const later = new Date(NOW.getTime() + 30 * 24 * 3_600_000);
    const report = await runJobFetch({ sources: [source("test", [job({ sourceJobId: "9" })])], now: later });
    expect(report.inserted).toBe(0);
    expect(await db().job.count()).toBe(1);
  });

  it("keeps a failing source from stopping the others, and logs the failure", async () => {
    const broken: JobSource = {
      name: "broken",
      isConfigured: () => true,
      fetch: async () => {
        throw new Error("boom");
      },
    };
    const report = await runJobFetch({ sources: [broken, source("ok", [job()])], now: NOW });
    expect(report.inserted).toBe(1);
    expect(report.sources.broken?.errors).toEqual(["broken failed unexpectedly."]);
  });

  it("passes this month's and today's request counts to the source", async () => {
    await runJobFetch({ sources: [source("test", [], 3)], now: new Date(Date.UTC(2026, 10, 2)) });
    await runJobFetch({ sources: [source("test", [], 2)], now: NOW });

    let seen: unknown;
    const spy: JobSource = {
      name: "test",
      isConfigured: () => true,
      fetch: async (context) => {
        seen = context.usage;
        return { jobs: [], requests: 0, queries: [], skipped: 0, errors: [] };
      },
    };
    await runJobFetch({ sources: [spy], now: NOW });
    expect(seen).toEqual({ requestsThisMonth: 5, requestsToday: 2 });
  });

  it("uses the profile's titles and locations when no search settings are saved", async () => {
    await db().profile.deleteMany();
    await db().profile.create({
      data: {
        json: {
          name: "Test",
          targetTitles: ["SAP Lead"],
          preferences: { locations: ["Qatar"] },
        },
      },
    });

    let seen: Partial<{ keywords: string[]; locations: string[] }> = {};
    const spy: JobSource = {
      name: "test",
      isConfigured: () => true,
      fetch: async ({ keywords, locations }) => {
        seen = { keywords, locations };
        return { jobs: [], requests: 0, queries: [], skipped: 0, errors: [] };
      },
    };
    await runJobFetch({ sources: [spy], now: NOW });
    expect(seen).toEqual({ keywords: ["SAP Lead"], locations: ["Qatar"] });
  });
});

describe("saved search settings", () => {
  it("drive the next search, in place of the profile's titles and locations", async () => {
    const { saveSearchSettings } = await import("@/lib/search/settings");
    await saveSearchSettings({ keywords: ["SAP CPI"], locations: ["Oman"] });

    let seen: Partial<{ keywords: string[]; locations: string[] }> = {};
    const spy: JobSource = {
      name: "test",
      isConfigured: () => true,
      fetch: async ({ keywords, locations }) => {
        seen = { keywords, locations };
        return { jobs: [], requests: 0, queries: [], skipped: 0, errors: [] };
      },
    };
    await runJobFetch({ sources: [spy], now: NOW });
    expect(seen).toEqual({ keywords: ["SAP CPI"], locations: ["Oman"] });

    await db().searchConfig.deleteMany();
  });

  it("are cleaned up and rejected when empty", async () => {
    const { SearchSettingsSchema } = await import("@/lib/search/settings");
    expect(SearchSettingsSchema.parse({ keywords: [" SAP ", "sap", ""], locations: ["Oman"] }).keywords).toEqual(["SAP"]);
    expect(SearchSettingsSchema.safeParse({ keywords: [" "], locations: ["Oman"] }).success).toBe(false);
  });
});
