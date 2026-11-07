import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoreCall } from "@/lib/matching/llmScore";
import { EMPTY_PROFILE } from "@/lib/profile/schema";
import { FIXTURE_JOBS } from "../fixtures/jobs";

const PORT = 5546;
const NOW = new Date(Date.UTC(2026, 10, 5, 12));
let server: PGLiteSocketServer;
let pg: PGlite;
let db: typeof import("@/lib/db").db;
let scoreNewJobs: typeof import("@/lib/matching/scoreJobs").scoreNewJobs;
let saveSearchSettings: typeof import("@/lib/search/settings").saveSearchSettings;
let saveProfile: typeof import("@/lib/profile/store").saveProfile;

const PROFILE = {
  ...EMPTY_PROFILE,
  name: "Test Person",
  coreSkills: ["SAP S/4HANA", "SAP CPI / Integration Suite", "ABAP", "BTP"],
  targetTitles: ["SAP Solution Architect"],
  preferences: { ...EMPTY_PROFILE.preferences, locations: ["Dubai", "Saudi Arabia"], excludeKeywords: ["junior"] },
};

const call = vi.fn<ScoreCall>(async () => ({
  parsed_output: {
    score: 82,
    verdict: "GOOD",
    matchedSkills: ["CPI"],
    missingSkills: [],
    seniorityFit: "fit",
    locationFit: true,
    reasoning: "Fits.",
    keyRequirements: [],
    redFlags: [],
  },
  stop_reason: "end_turn",
  usage: { input_tokens: 100, output_tokens: 20 },
}));

async function addJobs(jobs: { title: string; description: string; location?: string | null }[]) {
  await db().job.createMany({
    data: jobs.map((job, i) => ({
      source: "test",
      sourceJobId: `${job.title}-${i}`,
      title: job.title,
      company: "Acme",
      location: job.location ?? "Dubai",
      description: job.description,
      url: "https://example.com",
      dedupeHash: `${job.title}-${i}`,
    })),
  });
}

const STRONG = FIXTURE_JOBS[0]!;

beforeAll(async () => {
  pg = await PGlite.create();
  const dirs = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) await pg.exec(readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8"));
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 20 });
  await server.start();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;
  ({ db } = await import("@/lib/db"));
  ({ scoreNewJobs } = await import("@/lib/matching/scoreJobs"));
  ({ saveSearchSettings } = await import("@/lib/search/settings"));
  ({ saveProfile } = await import("@/lib/profile/store"));
});

afterAll(async () => {
  await db().$disconnect();
  await server.stop();
  await pg.close();
});

beforeEach(async () => {
  call.mockClear();
  await pg.exec('TRUNCATE "jobmatch"."Job", "jobmatch"."MatchScore", "jobmatch"."AuditLog", "jobmatch"."Profile", "jobmatch"."SearchConfig" CASCADE');
  await saveProfile(PROFILE);
});

describe("scoreNewJobs", () => {
  it("only pays for jobs that pass the free checks, and records why the others didn't", async () => {
    await addJobs([
      STRONG,
      { title: "Junior SAP Consultant", description: "ABAP and CPI" },
      { title: "Sales Manager", description: "Sell software to customers." },
      { title: "SAP CPI Lead", description: "CPI and S/4HANA", location: "London" },
    ]);

    const report = await scoreNewJobs({ now: NOW, call });

    expect(call).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ scored: 1, ruledOut: 3, remaining: 0, more: false, inputTokens: 100, outputTokens: 20, errors: [] });

    const scores = await db().matchScore.findMany({ include: { job: { select: { title: true } } } });
    expect(scores.find((s) => s.job.title === STRONG.title)).toMatchObject({ score: 82, verdict: "GOOD", inputTokens: 100 });
    expect(scores.find((s) => s.job.title === "Junior SAP Consultant")).toMatchObject({ score: 0, verdict: "REJECT", modelVersion: "rules" });
    expect(scores.find((s) => s.job.title === "Sales Manager")?.reasoning).toContain("Too few");
    expect(scores.find((s) => s.job.title === "SAP CPI Lead")?.locationFit).toBe(false);

    const log = await db().auditLog.findFirst({ where: { action: "jobs.score" } });
    expect(log?.payload).toMatchObject({ scored: 1, inputTokens: 100, outputTokens: 20 });
  });

  it("still scores a short listing when its title matches a target title", async () => {
    await addJobs([{ title: "Onsite SAP Solution Architect", description: "Apply now." }]);
    expect(await scoreNewJobs({ now: NOW, call })).toMatchObject({ scored: 1, ruledOut: 0 });
  });

  it("doesn't pay to score a job twice, but does when the profile changes", async () => {
    await addJobs([STRONG]);
    await scoreNewJobs({ now: NOW, call });
    await scoreNewJobs({ now: NOW, call });
    expect(call).toHaveBeenCalledTimes(1);

    await saveProfile({ ...PROFILE, yearsExperience: 21 });
    await scoreNewJobs({ now: NOW, call });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("stops at the daily limit and leaves the rest for tomorrow", async () => {
    await saveSearchSettings({ keywords: ["SAP"], locations: ["Dubai"], minScore: 70, scoreDailyCap: 2, draftDailyCap: 5, dailyApplyCap: 15 });
    await addJobs([STRONG, STRONG, STRONG]);

    // The database stamps scores with the real date, so this has to count from the real clock.
    const today = new Date();
    const first = await scoreNewJobs({ now: today, call });
    expect(call).toHaveBeenCalledTimes(2);
    expect(first).toMatchObject({ scored: 2, remaining: 1, capReached: true, more: false });

    await scoreNewJobs({ now: today, call });
    expect(call).toHaveBeenCalledTimes(2);

    await scoreNewJobs({ now: new Date(today.getTime() + 24 * 60 * 60 * 1000), call });
    expect(call).toHaveBeenCalledTimes(3);
  });

  it("makes no calls at all with a limit of zero", async () => {
    await saveSearchSettings({ keywords: ["SAP"], locations: ["Dubai"], minScore: 70, scoreDailyCap: 0, draftDailyCap: 5, dailyApplyCap: 15 });
    await addJobs([STRONG]);
    expect(await scoreNewJobs({ now: NOW, call })).toMatchObject({ scored: 0, remaining: 1, capReached: true });
    expect(call).not.toHaveBeenCalled();
  });

  it("retries a failed job on the next run without stopping the others", async () => {
    await addJobs([STRONG, STRONG]);
    call.mockRejectedValueOnce(new Error("network"));

    const first = await scoreNewJobs({ now: NOW, call });
    expect(first).toMatchObject({ scored: 1, remaining: 1 });
    expect(first.errors[0]).toContain("tried again");

    expect(await scoreNewJobs({ now: NOW, call })).toMatchObject({ scored: 1, remaining: 0, errors: [] });
  });

  it("records a refusal so it isn't paid for again", async () => {
    await addJobs([STRONG]);
    call.mockResolvedValueOnce({ parsed_output: null, stop_reason: "refusal", usage: { input_tokens: 5, output_tokens: 0 } });

    expect(await scoreNewJobs({ now: NOW, call })).toMatchObject({ scored: 0, ruledOut: 1, remaining: 0 });
    await scoreNewJobs({ now: NOW, call });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("re-checks ruled-out jobs when the search locations change", async () => {
    await addJobs([{ ...STRONG, location: "Muscat" }]);
    await scoreNewJobs({ now: NOW, call });
    expect(call).not.toHaveBeenCalled();

    await saveSearchSettings({ keywords: ["SAP"], locations: ["Oman"], minScore: 70, scoreDailyCap: 50, draftDailyCap: 5, dailyApplyCap: 15 });
    await scoreNewJobs({ now: NOW, call });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("explains what's missing when there's no API key or profile", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await addJobs([STRONG]);
    expect((await scoreNewJobs({ now: NOW })).errors[0]).toContain("ANTHROPIC_API_KEY");
    vi.unstubAllEnvs();

    await db().profile.deleteMany();
    expect((await scoreNewJobs({ now: NOW, call })).errors[0]).toContain("profile");
  });
});
