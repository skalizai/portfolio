import { describe, expect, it } from "vitest";
import { hardFilter, type FilterableJob } from "@/lib/matching/filters";
import { keywordScore, matchesTargetTitle, MIN_KEYWORD_SCORE } from "@/lib/matching/keywordScore";
import { llmScore, scoringPrompt, type MatchResult, type ScoreCallResult } from "@/lib/matching/llmScore";
import { EMPTY_PROFILE, type Profile } from "@/lib/profile/schema";
import { FIXTURE_JOBS } from "../fixtures/jobs";

const NOW = new Date(Date.UTC(2026, 10, 5));

const PROFILE: Profile = {
  ...EMPTY_PROFILE,
  name: "Test Person",
  contact: { email: "person@example.com", phone: "+1 555 0100", linkedinUrl: "", portfolioUrl: "" },
  coreSkills: ["SAP S/4HANA", "SAP CPI / Integration Suite", "PI/PO", "ABAP (RICEFW, OO)", "OData", "RAP", "BTP", "RISE with SAP"],
  modules: ["SD", "MM", "PP"],
  preferences: { ...EMPTY_PROFILE.preferences, excludeKeywords: ["junior", "intern"], minSeniority: "Senior" },
};

const LOCATIONS = ["Dubai", "Saudi Arabia", "Remote"];
const job = (title: string, location: string | null = "Dubai", extra = {}) => ({ title, location, workMode: null, postedAt: null, ...extra });
const filter = (candidate: FilterableJob) => hardFilter(candidate, PROFILE.preferences, LOCATIONS, NOW);

describe("hardFilter", () => {
  it("passes the fixtures it should, and rejects the junior one", () => {
    const outcomes = FIXTURE_JOBS.map((fixture) => [fixture.expected, filter(fixture) !== null]);
    expect(outcomes).toEqual([
      ["strong", false],
      ["strong", false],
      ["weak", false],
      ["weak", false],
      ["reject", true],
    ]);
  });

  it("rejects excluded words and low seniority in the title only", () => {
    expect(filter(job("Junior SAP Consultant"))?.reason).toContain("junior");
    expect(filter(job("Mid-Level SAP Integration Consultant"))?.seniorityFit).toBe("under");
    expect(filter(job("Associate Consultant"))?.seniorityFit).toBe("under");
    expect(filter(job("Associate Director, SAP"))).toBeNull();
    expect(filter({ ...job("SAP Lead"), description: "Mentor junior developers" } as never)).toBeNull();
    expect(filter(job("Internal Systems Architect"))).toBeNull();
  });

  it("treats places in the same market as one, and allows remote or unstated locations", () => {
    expect(filter(job("SAP Lead", "Sharjah"))).toBeNull();
    expect(filter(job("SAP Lead", "Ras Al-Khaimah - Ras Al Khaimah"))).toBeNull();
    expect(filter(job("SAP Lead", "Riyadh"))).toBeNull();
    expect(filter(job("SAP Lead", "United Arab Emirates"))).toBeNull();
    expect(filter(job("SAP Lead", null))).toBeNull();
    expect(filter(job("SAP Lead", "Anywhere"))).toBeNull();
    expect(filter(job("SAP Lead", "London", { workMode: "remote" }))).toBeNull();
    expect(filter(job("SAP Lead", "London"))?.locationFit).toBe(false);
    expect(filter(job("SAP Lead", "Doha"))?.locationFit).toBe(false);
  });

  it("recognises cities in countries added to the search", () => {
    const wanted = ["New Zealand", "Australia"];
    expect(hardFilter(job("SAP Lead", "Auckland"), PROFILE.preferences, wanted, NOW)).toBeNull();
    expect(hardFilter(job("SAP Lead", "Sydney NSW"), PROFILE.preferences, wanted, NOW)).toBeNull();
    expect(hardFilter(job("SAP Lead", "Dubai"), PROFILE.preferences, wanted, NOW)?.locationFit).toBe(false);
  });

  describe("visa sponsorship", () => {
    const preferences = { ...PROFILE.preferences, visaSponsorshipLocations: ["New Zealand", "Australia"] };
    const check = (location: string, description: string) =>
      hardFilter({ title: "SAP Lead", location, workMode: null, postedAt: null, description }, preferences, ["New Zealand", "Australia", "Dubai"], NOW);

    it("rejects listings that don't mention it, by city as well as country", () => {
      expect(check("Auckland, Auckland, New Zealand", "Lead our SAP team.")?.reason).toContain("doesn't mention visa sponsorship");
      expect(check("Sydney NSW", "Lead our SAP team.")?.reason).toContain("Australia");
    });

    it.each([
      "Unfortunately, we are unable to offer visa sponsorship at this time.",
      "Visa sponsorship is not available for this position.",
      "TerraCycle does not provide for visa sponsorships.",
      "We do not offer visa sponsorship of any kind.",
      "No visa sponsorship.",
    ])("rejects a refusal: %s", (description) => {
      expect(check("Melbourne, Victoria, Australia", description)?.reason).toContain("isn't available");
    });

    it.each([
      "For the successful applicant we will support with obtaining work visa.",
      "We offer: * Visa sponsorship",
      "Speech Pathologist - 482 Visa Sponsorship Available",
      "Do you need any visa sponsorship?",
    ])("passes this on to Claude: %s", (description) => {
      expect(check("Auckland", description)).toBeNull();
    });

    it("recognises suburbs by their state or region", () => {
      for (const location of ["Beenleigh QLD 4207", "Macquarie Park NSW", "Greater Hamilton Area", "Perth WA 6000"]) {
        expect(check(location, "We offer: * Visa sponsorship")).toBeNull();
      }
      expect(check("Beenleigh QLD 4207", "Lead our SAP team.")?.reason).toContain("Australia");
    });

    it("doesn't apply elsewhere", () => {
      expect(check("Dubai", "Lead our SAP team.")).toBeNull();
    });
  });

  it("rejects jobs over 30 days old", () => {
    expect(filter(job("SAP Lead", "Dubai", { postedAt: new Date(Date.UTC(2026, 9, 1)) }))?.reason).toContain("30 days");
    expect(filter(job("SAP Lead", "Dubai", { postedAt: new Date(Date.UTC(2026, 9, 20)) }))).toBeNull();
  });
});

describe("keywordScore", () => {
  const score = (description: string, title = "Role") => keywordScore({ title, description }, PROFILE);

  it("sends every SAP fixture on to Claude", () => {
    for (const fixture of FIXTURE_JOBS) expect(keywordScore(fixture, PROFILE)).toBeGreaterThanOrEqual(MIN_KEYWORD_SCORE);
  });

  it("ranks the strong fixtures above the weak ones", () => {
    const [strong1, strong2, weak1, weak2] = FIXTURE_JOBS.map((fixture) => keywordScore(fixture, PROFILE));
    expect(Math.min(strong1!, strong2!)).toBeGreaterThan(Math.max(weak1!, weak2!));
  });

  it("skips listings that share almost nothing with the profile", () => {
    expect(score("Design cloud solutions on AWS for enterprise customers.")).toBeLessThan(MIN_KEYWORD_SCORE);
    expect(score("Sales expert for SAP CX products.")).toBeLessThan(MIN_KEYWORD_SCORE);
  });

  it("weights high-value skills, caps at 40 and recognises common spellings", () => {
    expect(score("CPI")).toBe(8);
    expect(score("OData")).toBe(3);
    expect(score("MM")).toBe(2);
    expect(score("S4HANA")).toBe(8);
    expect(score("S/4 HANA")).toBe(8);
    expect(score("SAP Cloud Integration")).toBe(8);
    expect(score("CPI S/4HANA ABAP BTP RISE OData RAP MM SD PP PI")).toBe(40);
  });

  it("doesn't match short names inside other words or in lower case", () => {
    expect(score("the app supports upgrades, mmm, rise of cloud")).toBe(0);
  });
});

describe("matchesTargetTitle", () => {
  const TARGETS = ["SAP Solution Architect", "SAP Technical Lead", "SAP CPI Lead"];

  it("accepts titles containing a target's words, in any order, singular or plural", () => {
    expect(matchesTargetTitle("Onsite SAP Solution Architect – S/4HANA Transformation Lead", TARGETS)).toBe(true);
    expect(matchesTargetTitle("SAP ABAP Architect & Technical Solution Lead", TARGETS)).toBe(true);
    expect(matchesTargetTitle("xECM for SAP Solutions Architect", TARGETS)).toBe(true);
    expect(matchesTargetTitle("Lead, SAP CPI", TARGETS)).toBe(true);
  });

  it("rejects titles that only share some of the words, and empty targets", () => {
    expect(matchesTargetTitle("Snr Solution Architect, UAE Enterprise", TARGETS)).toBe(false);
    expect(matchesTargetTitle("SAP Sales Lead", TARGETS)).toBe(false);
    expect(matchesTargetTitle("SAP Lead", [""])).toBe(false);
  });
});

describe("llmScore", () => {
  const RESULT: MatchResult = {
    score: 88.4,
    verdict: "STRONG",
    matchedSkills: ["CPI"],
    missingSkills: [],
    seniorityFit: "fit",
    locationFit: true,
    reasoning: "Fits.",
    keyRequirements: [],
    redFlags: [],
  };
  const reply = (overrides: Partial<ScoreCallResult> = {}) => async () => ({
    parsed_output: RESULT,
    stop_reason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 20 },
    ...overrides,
  });

  it("rounds and bounds the score, and returns token use", async () => {
    const outcome = await llmScore(FIXTURE_JOBS[0]!, PROFILE, reply());
    expect(outcome).toMatchObject({ kind: "scored", result: { score: 88 }, inputTokens: 100, outputTokens: 20 });

    const high = await llmScore(FIXTURE_JOBS[0]!, PROFILE, reply({ parsed_output: { ...RESULT, score: 140 } }));
    expect(high).toMatchObject({ result: { score: 100 } });
  });

  it("reports refusals and unreadable or cut-off replies without inventing a score", async () => {
    expect((await llmScore(FIXTURE_JOBS[0]!, PROFILE, reply({ stop_reason: "refusal", parsed_output: null }))).kind).toBe("declined");
    expect((await llmScore(FIXTURE_JOBS[0]!, PROFILE, reply({ parsed_output: null }))).kind).toBe("unreadable");
    expect((await llmScore(FIXTURE_JOBS[0]!, PROFILE, reply({ stop_reason: "max_tokens" }))).kind).toBe("unreadable");
  });

  it("doesn't send name or contact details, and marks the listing as untrusted", () => {
    const prompt = scoringPrompt(FIXTURE_JOBS[0]!, PROFILE);
    expect(prompt).not.toContain("person@example.com");
    expect(prompt).not.toContain("+1 555 0100");
    expect(prompt).not.toContain("Test Person");
    expect(prompt).toContain("<job_description>");
  });
});
