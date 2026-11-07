import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findUnsupportedClaims, wordCount } from "@/lib/apply/claims";
import type { StructuredCv } from "@/lib/apply/cvSchema";
import { printable } from "@/lib/apply/printable";
import { buildTailoredCv, draftApplication, keepIndustryFirst, reorder, type DraftCall, type DraftOutput } from "@/lib/apply/draft";
import { EMPTY_PROFILE, type Profile } from "@/lib/profile/schema";
import { FIXTURE_JOBS } from "../fixtures/jobs";

const PROFILE: Profile = {
  ...EMPTY_PROFILE,
  name: "Test Person",
  headline: "SAP Integration Lead",
  location: "Dubai, UAE",
  yearsExperience: 21,
  contact: { email: "person@example.com", phone: "+1 555 0100", linkedinUrl: "", portfolioUrl: "" },
  coreSkills: ["SAP CPI", "ABAP"],
};

const CV: StructuredCv = {
  competencies: ["ABAP development", "CPI integration", "Team leadership"],
  experience: [
    { role: "Technical Architect", company: "Acme", location: "Dubai", dates: "2020 to 2024", bullets: ["Led a team of 10", "Built IMOS to S/4HANA integration on CPI"] },
    { role: "ABAP Lead", company: "Globex", location: "Abu Dhabi", dates: "2015 to 2020", bullets: ["Wrote RICEFW objects"] },
  ],
  education: ["BSc Computer Science"],
  certifications: ["SAP Certified Application Associate"],
  other: [],
};

const JOB = FIXTURE_JOBS[0]!;
const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");

const LETTER = `Dear Hiring Manager,

I lead SAP integration work with 21 years of experience. At Acme I built IMOS to S/4HANA integration on CPI and led a team of 10. ${words(170)}

Yours faithfully,
Test Person`;

const DRAFT: DraftOutput = {
  status: "ok",
  coverLetter: LETTER,
  missingInfo: [],
  headline: "SAP Integration Architect",
  summary: "An SAP integration lead with 21 years of experience.",
  competencyOrder: [1, 0, 2],
  bulletOrders: [{ role: 0, order: [1, 0] }],
};

const replying = (overrides: Partial<DraftOutput> = {}, extra = {}): DraftCall =>
  vi.fn(async () => ({ parsed_output: { ...DRAFT, ...overrides }, stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 }, ...extra }));

describe("findUnsupportedClaims", () => {
  const sources = ["Led a team of 10 and built IMOS to S/4HANA integration on CPI at Acme. 21 years of experience."];

  it("accepts text that sticks to the sources", () => {
    expect(findUnsupportedClaims("Dear Hiring Manager,\n\nI led a team of 10 at Acme, building S/4HANA integration on CPI, over 21 years.\n\nYours faithfully,", sources)).toEqual([]);
  });

  it("catches an invented number, skill and employer", () => {
    expect(findUnsupportedClaims("I led a team of 50.", sources)).toEqual(["50"]);
    expect(findUnsupportedClaims("I built integrations with Salesforce and MuleSoft at Acme.", sources)).toEqual(["Salesforce", "MuleSoft"]);
    expect(findUnsupportedClaims("I saved 40% across the group using TOGAF.", sources)).toEqual(["40", "TOGAF"]);
    expect(findUnsupportedClaims("Earlier I worked at Initech for years.", sources)).toEqual(["Initech"]);
  });

  it("doesn't flag an ordinary capitalised word that starts a sentence, or match inside other words", () => {
    expect(findUnsupportedClaims("Delivery matters. Quality too.", sources)).toEqual([]);
    expect(findUnsupportedClaims("Used SAPUI5.", sources)).toEqual(["SAPUI5"]);
  });

  it("counts words", () => {
    expect(wordCount("  one two\n\nthree ")).toBe(3);
  });
});

describe("reorder", () => {
  it("applies the order, keeps anything left out and ignores anything invalid", () => {
    expect(reorder(["a", "b", "c"], [2, 0, 1])).toEqual(["c", "a", "b"]);
    expect(reorder(["a", "b", "c"], [1])).toEqual(["b", "a", "c"]);
    expect(reorder(["a", "b"], [5, -1, 1.5, 1, 1])).toEqual(["b", "a"]);
    expect(reorder(["a", "b"], [])).toEqual(["a", "b"]);
  });
});

describe("printable", () => {
  it("spells out arrows, which the PDF font can't draw", () => {
    expect(printable("all EBOSS → EWM flows")).toBe("all EBOSS to EWM flows");
    expect(printable("SAP ↔ EBOSS")).toBe("SAP and EBOSS");
  });

  it("keeps Western European text and drops what can't be printed", () => {
    expect(printable("Müller’s — café 100%")).toBe("Müller’s — café 100%");
    expect(printable("📍 Dubai ▸")).toBe("Dubai");
  });
});

describe("keepIndustryFirst", () => {
  it("moves the Industry line to the top and keeps the rest in order", () => {
    expect(keepIndustryFirst(["Did B", "Industry: Oil | Project: X", "Did A"])).toEqual(["Industry: Oil | Project: X", "Did B", "Did A"]);
    expect(keepIndustryFirst(["Did B", "Mentioned Industry: Oil"])).toEqual(["Did B", "Mentioned Industry: Oil"]);
  });
});

describe("buildTailoredCv", () => {
  it("keeps the Industry line first even when Claude moves it", () => {
    const withIndustry = { ...CV, experience: [{ ...CV.experience[0]!, bullets: ["Industry: Oil", "Did A", "Did B"] }] };
    const cv = buildTailoredCv(withIndustry, { ...DRAFT, bulletOrders: [{ role: 0, order: [2, 1, 0] }] }, PROFILE);
    expect(cv.experience[0]!.bullets).toEqual(["Industry: Oil", "Did B", "Did A"]);
  });

  it("can only reorder the CV's content, whatever Claude returns", () => {
    const cv = buildTailoredCv(CV, { ...DRAFT, competencyOrder: [99, 2], bulletOrders: [{ role: 7, order: [0] }, { role: 0, order: [1] }] }, PROFILE);

    expect(cv.competencies.slice().sort()).toEqual(CV.competencies.slice().sort());
    expect(cv.competencies[0]).toBe("Team leadership");
    expect(cv.experience[0]!.bullets).toEqual(["Built IMOS to S/4HANA integration on CPI", "Led a team of 10"]);
    expect(cv.experience.map((role) => [role.role, role.company, role.dates])).toEqual(CV.experience.map((role) => [role.role, role.company, role.dates]));
    expect(cv.certifications).toEqual(CV.certifications);
    expect(cv.education).toEqual(CV.education);
  });

  it("takes contact details from the profile", () => {
    const cv = buildTailoredCv(CV, DRAFT, PROFILE);
    expect(cv.name).toBe("Test Person");
    expect(cv.contact).toEqual(["person@example.com", "+1 555 0100", "Dubai, UAE"]);
  });
});

describe("draftApplication", () => {
  it("returns a clean draft when it sticks to the facts", async () => {
    const outcome = await draftApplication({ ...JOB, company: "Gulf Energy" }, PROFILE, CV, replying());
    expect(outcome).toMatchObject({ kind: "ok", warnings: [], inputTokens: 100, outputTokens: 50 });
  });

  it("counts cached input in the tokens it reports", async () => {
    const usage = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 900, cache_read_input_tokens: 9000 };
    expect(await draftApplication(JOB, PROFILE, CV, replying({}, { usage }))).toMatchObject({ inputTokens: 10000, outputTokens: 50 });
  });

  it("warns about invented facts in the letter and the summary", async () => {
    const outcome = await draftApplication(JOB, PROFILE, CV, replying({
      coverLetter: `${LETTER}\nI also hold TOGAF and led 500 people.`,
      summary: "Worked at Initech on MuleSoft.",
    }));
    expect(outcome.kind).toBe("ok");
    const warning = outcome.kind === "ok" ? outcome.warnings.join(" ") : "";
    for (const term of ["TOGAF", "500", "Initech", "MuleSoft"]) expect(warning).toContain(term);
  });

  it("warns when the letter is outside the length range", async () => {
    const outcome = await draftApplication(JOB, PROFILE, CV, replying({ coverLetter: "Dear Hiring Manager,\n\nToo short." }));
    expect(outcome.kind === "ok" && outcome.warnings.join(" ")).toContain("words");
  });

  it("returns insufficient_info rather than a letter, and still builds the CV", async () => {
    const outcome = await draftApplication(JOB, PROFILE, CV, replying({ status: "insufficient_info", coverLetter: "", missingInfo: ["Certification"] }));
    expect(outcome).toMatchObject({ kind: "insufficient", missingInfo: ["Certification"] });
  });

  it("reports refusals and unreadable replies", async () => {
    expect((await draftApplication(JOB, PROFILE, CV, replying({}, { stop_reason: "refusal", parsed_output: null }))).kind).toBe("failed");
    expect((await draftApplication(JOB, PROFILE, CV, replying({}, { parsed_output: null }))).kind).toBe("failed");
    expect((await draftApplication(JOB, PROFILE, CV, replying({}, { stop_reason: "max_tokens" }))).kind).toBe("failed");
  });
});

describe("preparing drafts", () => {
  const PORT = 5547;
  const NOW = new Date(Date.UTC(2026, 10, 5, 12));
  let server: PGLiteSocketServer;
  let pg: PGlite;
  let db: typeof import("@/lib/db").db;
  let prepareDraft: typeof import("@/lib/apply/prepare").prepareDraft;
  let prepareNewMatches: typeof import("@/lib/apply/prepare").prepareNewMatches;
  let saveProfile: typeof import("@/lib/profile/store").saveProfile;
  let getStructuredCv: typeof import("@/lib/apply/parseCv").getStructuredCv;

  const parse = vi.fn(async () => ({ parsed_output: CV, stop_reason: "end_turn" }));
  const options = () => ({ draft: replying(), parse, now: NOW });

  async function addJob(id: string, overrides: Record<string, unknown> = {}, score: number | null = null) {
    await db().job.create({
      data: { id, source: "test", sourceJobId: id, title: "SAP Lead", company: `Company ${id}`, location: "Dubai", description: "CPI", url: "https://example.com", dedupeHash: id, ...overrides },
    });
    if (score !== null) {
      const profile = await db().profile.findFirstOrThrow();
      await db().matchScore.create({
        data: { jobId: id, score, verdict: "GOOD", matchedSkills: [], missingSkills: [], keyRequirements: [], redFlags: [], seniorityFit: "fit", locationFit: true, reasoning: "Fits.", modelVersion: "test", profileUpdatedAt: profile.updatedAt },
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
    ({ db } = await import("@/lib/db"));
    ({ prepareDraft, prepareNewMatches } = await import("@/lib/apply/prepare"));
    ({ saveProfile } = await import("@/lib/profile/store"));
    ({ getStructuredCv } = await import("@/lib/apply/parseCv"));
  });

  afterAll(async () => {
    await db().$disconnect();
    await server.stop();
    await pg.close();
  });

  beforeEach(async () => {
    parse.mockClear();
    await pg.exec('TRUNCATE "jobmatch"."Application", "jobmatch"."Job", "jobmatch"."MatchScore", "jobmatch"."AuditLog", "jobmatch"."Profile", "jobmatch"."SearchConfig" CASCADE');
    await saveProfile(PROFILE, "Some CV text");
  });

  it("creates one draft and doesn't pay for it twice", async () => {
    await addJob("a");
    const draft = replying();
    const first = await prepareDraft("a", { draft, parse, now: NOW });
    const second = await prepareDraft("a", { draft, parse, now: NOW });

    expect(first).toMatchObject({ status: "created" });
    expect(second).toMatchObject({ status: "exists" });
    expect(draft).toHaveBeenCalledTimes(1);

    const saved = await db().application.findUniqueOrThrow({ where: { jobId: "a" } });
    expect(saved).toMatchObject({ status: "DRAFT", coverLetter: LETTER, submittedAt: null, sendAt: null, inputTokens: 100 });
  });

  it("stops at the daily limit, which resets the next day", async () => {
    await db().searchConfig.create({ data: { keywords: [], locations: [], sourcesEnabled: [], draftDailyCap: 1 } });
    await addJob("a");
    await addJob("b");
    const today = new Date();
    expect(await prepareDraft("a", { ...options(), now: today })).toMatchObject({ status: "created" });
    expect(await prepareDraft("b", { ...options(), now: today })).toMatchObject({ status: "capped" });

    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    expect(await prepareDraft("b", { ...options(), now: tomorrow })).toMatchObject({ status: "created" });
  });

  it("makes no call with a limit of zero", async () => {
    await db().searchConfig.create({ data: { keywords: [], locations: [], sourcesEnabled: [], draftDailyCap: 0 } });
    await addJob("a");
    const draft = replying();
    expect(await prepareDraft("a", { draft, parse, now: NOW })).toMatchObject({ status: "capped" });
    expect(draft).not.toHaveBeenCalled();
  });

  it("parses the CV once, without changing the profile's date or re-scoring", async () => {
    const before = (await db().profile.findFirstOrThrow()).updatedAt;
    await addJob("a");
    await addJob("b");
    await prepareDraft("a", options());
    await prepareDraft("b", options());
    expect(parse).toHaveBeenCalledTimes(1);
    expect((await db().profile.findFirstOrThrow()).updatedAt).toEqual(before);
    expect(await getStructuredCv(parse)).toEqual(CV);
  });

  it("parses again when a new CV is saved", async () => {
    await getStructuredCv(parse);
    await saveProfile(PROFILE, "A newer CV");
    await getStructuredCv(parse);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("stores an uploaded CV at once, without changing the profile's date or re-scoring", async () => {
    const { saveCvText, getProfile } = await import("@/lib/profile/store");
    await getStructuredCv(parse);
    const before = (await db().profile.findFirstOrThrow()).updatedAt;

    await saveCvText("The corrected CV");

    const row = await db().profile.findFirstOrThrow();
    expect(row).toMatchObject({ cvText: "The corrected CV", cvStructured: null });
    expect(row.updatedAt).toEqual(before);
    expect((await getProfile())?.profile.name).toBe("Test Person");
    await getStructuredCv(parse);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("warns about a repeat application at the same company", async () => {
    await addJob("a", { company: "Acme", title: "SAP Lead" });
    await addJob("b", { company: "ACME", title: "sap lead" });
    await prepareDraft("a", options());
    await db().application.updateMany({ where: { jobId: "a" }, data: { submittedAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000), status: "SUBMITTED" } });
    await prepareDraft("b", options());
    const second = await db().application.findUniqueOrThrow({ where: { jobId: "b" } });
    expect(second.draftWarnings[0]).toContain("last 30 days");
  });

  it("explains a missing CV, profile or key without creating anything", async () => {
    await addJob("a");
    await db().profile.updateMany({ data: { cvText: null, cvStructured: undefined } });
    expect(await prepareDraft("a", options())).toMatchObject({ status: "failed", message: expect.stringContaining("CV") });

    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(await prepareDraft("a")).toMatchObject({ status: "failed", message: expect.stringContaining("ANTHROPIC_API_KEY") });
    vi.unstubAllEnvs();
    expect(await db().application.count()).toBe(0);
  });

  describe("the morning run", () => {
    it("drafts the best matches first, within the limit, and never sends", async () => {
      await db().searchConfig.create({ data: { keywords: [], locations: [], sourcesEnabled: [], draftDailyCap: 2 } });
      await addJob("low", {}, 75);
      await addJob("top", {}, 95);
      await addJob("mid", {}, 85);
      await addJob("under", {}, 50);

      expect(await prepareNewMatches(options())).toMatchObject({ created: 2, more: false, errors: [] });
      const drafted = await db().application.findMany({ select: { jobId: true, status: true, submittedAt: true, sendAt: true, emailMessageId: true } });
      expect(drafted.map((a) => a.jobId).sort()).toEqual(["mid", "top"]);
      expect(drafted.every((a) => a.status === "DRAFT" && !a.submittedAt && !a.sendAt && !a.emailMessageId)).toBe(true);
    });

    it("leaves dismissed jobs and those needing a sponsorship question for you", async () => {
      await saveProfile({ ...PROFILE, preferences: { ...PROFILE.preferences, visaSponsorshipLocations: ["New Zealand"] } }, "Some CV text");
      await addJob("gone", { state: "DISMISSED" }, 90);
      await addJob("silent", { location: "Auckland", description: "CPI lead" }, 90);
      await addJob("offers", { location: "Auckland", description: "CPI lead. Visa sponsorship provided." }, 90);

      expect(await prepareNewMatches(options())).toMatchObject({ created: 1 });
      const drafted = await db().application.findMany({ select: { jobId: true } });
      expect(drafted.map((a) => a.jobId)).toEqual(["offers"]);
    });
  });
});
