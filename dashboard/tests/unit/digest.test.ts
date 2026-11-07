import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DigestDeliver } from "@/lib/notify/digest";

const PORT = 5549;

let server: PGLiteSocketServer;
let pg: PGlite;
let db: typeof import("@/lib/db").db;
let digest: typeof import("@/lib/notify/digest");

const deliver = vi.fn<DigestDeliver>(async () => ({ messageId: "<id@example.com>" }));

let created = 0;
async function addJob(id: string, scores: { score: number; model?: string }[], overrides: { state?: "ACTIVE" | "DISMISSED"; location?: string; description?: string; applyEmail?: string } = {}) {
  await db().job.create({
    data: {
      id,
      source: "test",
      sourceJobId: id,
      title: `SAP Lead ${id}`,
      company: `Company ${id}`,
      location: overrides.location ?? "Dubai",
      description: overrides.description ?? "A job.",
      url: `https://example.com/${id}`,
      dedupeHash: id,
      state: overrides.state ?? "ACTIVE",
      applyEmail: overrides.applyEmail,
    },
  });
  for (const { score, model = "claude-test" } of scores) {
    await db().matchScore.create({
      data: {
        jobId: id,
        score,
        verdict: "STRONG",
        matchedSkills: [],
        missingSkills: [],
        keyRequirements: [],
        redFlags: [],
        seniorityFit: "fit",
        locationFit: true,
        reasoning: "Reason.",
        modelVersion: model,
        profileUpdatedAt: new Date(),
        // Later scores are newer, so the last one listed is the latest.
        createdAt: new Date(Date.UTC(2026, 10, 1) + created++ * 1000),
      },
    });
  }
}

beforeAll(async () => {
  pg = await PGlite.create();
  const dirs = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  for (const dir of dirs) await pg.exec(readFileSync(`prisma/migrations/${dir}/migration.sql`, "utf8"));
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 20 });
  await server.start();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`;
  process.env.SMTP_USER = "me@example.com";
  delete process.env.SMTP_APP_PASSWORD;
  delete process.env.DIGEST_TO;
  ({ db } = await import("@/lib/db"));
  digest = await import("@/lib/notify/digest");
});

afterAll(async () => {
  await db().$disconnect();
  await server.stop();
  await pg.close();
});

beforeEach(async () => {
  deliver.mockClear();
  deliver.mockImplementation(async () => ({ messageId: "<id@example.com>" }));
  await pg.exec('TRUNCATE "jobmatch"."Application", "jobmatch"."MatchScore", "jobmatch"."Job", "jobmatch"."AuditLog", "jobmatch"."SearchConfig" CASCADE');
});

describe("sendDigest", () => {
  it("emails new matches best first, to you, and each job only once", async () => {
    await addJob("b", [{ score: 75 }]);
    await addJob("a", [{ score: 90 }]);
    await addJob("low", [{ score: 60 }]);

    expect(await digest.sendDigest({ deliver })).toEqual({ status: "sent", jobs: 2, more: 0 });
    const email = deliver.mock.calls[0]![0];
    expect(email.to).toBe("me@example.com");
    expect(email.subject).toBe("2 new job matches · top 90: SAP Lead a at Company a");
    expect(email.text.indexOf("SAP Lead a")).toBeLessThan(email.text.indexOf("SAP Lead b"));
    expect(email.text).not.toContain("SAP Lead low");

    expect(await digest.sendDigest({ deliver })).toEqual({ status: "nothing-new" });
    expect(deliver).toHaveBeenCalledTimes(1);

    await addJob("c", [{ score: 80 }]);
    expect(await digest.sendDigest({ deliver })).toMatchObject({ status: "sent", jobs: 1 });
    expect(deliver.mock.calls[1]![0].subject).toBe("New job match: 80 · SAP Lead c at Company c");
  });

  it("goes by the latest score, and leaves out rule-only scores, dismissed jobs and ones you've applied for", async () => {
    await addJob("dropped", [{ score: 90 }, { score: 50 }]);
    await addJob("rules", [{ score: 95, model: "rules" }]);
    await addJob("dismissed", [{ score: 90 }], { state: "DISMISSED" });
    await addJob("applied", [{ score: 90 }]);
    await db().application.create({ data: { jobId: "applied", channel: "COMPANY_SITE", status: "SUBMITTED", submittedAt: new Date() } });
    await addJob("drafted", [{ score: 85 }]);
    await db().application.create({ data: { jobId: "drafted", channel: "COMPANY_SITE" } });

    expect(await digest.sendDigest({ deliver })).toMatchObject({ status: "sent", jobs: 1 });
    const { text } = deliver.mock.calls[0]![0];
    expect(text).toContain("SAP Lead drafted");
    expect(text).toContain("A cover letter and CV are ready in the dashboard.");
  });

  it("tries again next time when the email fails", async () => {
    await addJob("a", [{ score: 90 }]);
    deliver.mockRejectedValueOnce(new Error("smtp down"));
    await expect(digest.sendDigest({ deliver })).rejects.toThrow();
    expect((await db().job.findUniqueOrThrow({ where: { id: "a" } })).notifiedAt).toBeNull();

    expect(await digest.sendDigest({ deliver })).toMatchObject({ status: "sent", jobs: 1 });
  });

  it("sends at most the limit, and says how many are left for next time", async () => {
    for (let i = 0; i < digest.DIGEST_LIMIT + 2; i++) await addJob(`j${i}`, [{ score: 80 }]);
    expect(await digest.sendDigest({ deliver })).toEqual({ status: "sent", jobs: digest.DIGEST_LIMIT, more: 2 });
    expect(deliver.mock.calls[0]![0].text).toContain("2 more scored 70 or above.");
    expect(await digest.sendDigest({ deliver })).toEqual({ status: "sent", jobs: 2, more: 0 });
  });

  it("says what's missing when Yahoo isn't set up, and sends nothing", async () => {
    await addJob("a", [{ score: 90 }]);
    expect(await digest.sendDigest()).toMatchObject({ status: "not-configured" });
    expect((await db().job.findUniqueOrThrow({ where: { id: "a" } })).notifiedAt).toBeNull();
  });
});

describe("digestText", () => {
  const job = { id: "x", title: "SAP Architect", company: "Acme", location: "Sydney, NSW, Australia", description: "Great role.", url: "https://example.com/x", applyUrl: null, applyEmail: "jobs@acme.example.com", score: 82, hasDraft: false };

  it("shows the score, where to apply and a sponsorship warning where you need one", () => {
    const { text } = digestText([job], { more: 0, minScore: 70, dashboardUrl: "https://dash.example.com", visaLocations: ["Australia"] });
    expect(text).toContain("1. 82 · SAP Architect");
    expect(text).toContain("Email to apply: jobs@acme.example.com");
    expect(text).toContain("Listing: https://example.com/x");
    expect(text).toContain("Visa sponsorship isn't mentioned");
    expect(text).toContain("Open the dashboard: https://dash.example.com");
  });

  it("leaves out the sponsorship warning where you don't need a visa", () => {
    const { text } = digestText([{ ...job, location: "Dubai" }], { more: 0, minScore: 70, visaLocations: ["Australia"] });
    expect(text).not.toContain("Visa sponsorship");
    expect(text).not.toContain("Open the dashboard");
  });

  // Imported lazily above, so this reads it from the loaded module.
  function digestText(...args: Parameters<typeof import("@/lib/notify/digest").digestText>) {
    return digest.digestText(...args);
  }
});
