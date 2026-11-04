import { describe, expect, it } from "vitest";
import { CvExtractionError, extractProfile, type CvFacts, type ExtractionCall } from "@/lib/cv/extractProfile";
import { applyChanges, diffProfiles } from "@/lib/profile/diff";
import { EMPTY_PROFILE, ProfileSchema, type Profile } from "@/lib/profile/schema";

const current: Profile = {
  ...EMPTY_PROFILE,
  name: "Test Person",
  headline: "SAP Architect",
  contact: { email: "a@example.com", phone: "123", linkedinUrl: "", portfolioUrl: "https://example.com" },
  coreSkills: ["SAP CPI", "BTP"],
  targetTitles: ["SAP Lead"],
  preferences: { ...EMPTY_PROFILE.preferences, locations: ["Dubai"] },
};

const facts: CvFacts = {
  name: "Test Person",
  headline: "SAP Integration Lead",
  location: "Dubai",
  yearsExperience: 20.4,
  currentRole: "Architect",
  contact: { email: "a@example.com", phone: "123", linkedinUrl: "https://linkedin.example", portfolioUrl: "" },
  coreSkills: ["sap cpi", "ABAP"],
  modules: [],
  industries: [],
  certifications: [],
  leadership: "",
};

const answering =
  (parsed_output: CvFacts | null, stop_reason = "end_turn"): ExtractionCall =>
  async () => ({ parsed_output, stop_reason });

describe("extractProfile", () => {
  it("replaces CV fields but keeps target titles and preferences", async () => {
    const result = await extractProfile("cv", current, answering(facts));
    expect(result.headline).toBe("SAP Integration Lead");
    expect(result.yearsExperience).toBe(20);
    expect(result.targetTitles).toEqual(["SAP Lead"]);
    expect(result.preferences.locations).toEqual(["Dubai"]);
  });

  it("passes the CV to the model and tells it not to invent facts", async () => {
    let seen = { system: "", user: "" };
    await extractProfile("MY-CV-TEXT", current, async (system, user) => {
      seen = { system, user };
      return { parsed_output: facts, stop_reason: "end_turn" };
    });
    expect(seen.user).toContain("<cv>\nMY-CV-TEXT\n</cv>");
    expect(seen.system).toContain("Use only facts stated in the CV");
  });

  it.each([
    ["a refusal", answering(facts, "refusal")],
    ["a cut-off response", answering(facts, "max_tokens")],
    ["an unreadable response", answering(null)],
    ["an invalid profile", answering({ ...facts, name: "" })],
  ])("reports %s as an extraction error", async (_name, call) => {
    await expect(extractProfile("cv", current, call)).rejects.toBeInstanceOf(CvExtractionError);
  });
});

describe("diffProfiles", () => {
  const proposed: Profile = { ...current, headline: "SAP Integration Lead", coreSkills: ["sap cpi", "ABAP"] };

  it("ignores differences in capitalisation within lists", () => {
    const change = diffProfiles(current, proposed).find((c) => c.id === "coreSkills.add");
    expect(change).toMatchObject({ items: ["ABAP"] });
  });

  it("recommends additions but not removals", () => {
    const changes = diffProfiles(current, proposed);
    expect(changes.find((c) => c.id === "coreSkills.add")?.recommended).toBe(true);
    expect(changes.find((c) => c.id === "coreSkills.remove")).toMatchObject({ items: ["BTP"], recommended: false });
  });

  it("doesn't offer to erase a contact detail the CV leaves out", () => {
    const changes = diffProfiles(current, {
      ...current,
      contact: { ...current.contact, portfolioUrl: "", linkedinUrl: "https://linkedin.example" },
    });
    expect(changes.map((c) => c.id)).toEqual(["contact.linkedinUrl"]);
  });

  it("reports nothing for an identical profile", () => {
    expect(diffProfiles(current, structuredClone(current))).toEqual([]);
  });
});

describe("applyChanges", () => {
  const proposed: Profile = {
    ...current,
    headline: "New headline",
    yearsExperience: 21,
    contact: { ...current.contact, linkedinUrl: "https://linkedin.example" },
    coreSkills: ["SAP CPI", "ABAP"],
  };
  const changes = diffProfiles(current, proposed);

  it("applies only what is selected", () => {
    const result = applyChanges(current, proposed, changes, new Set(["coreSkills.add", "yearsExperience"]));
    expect(result.coreSkills).toEqual(["SAP CPI", "BTP", "ABAP"]);
    expect(result.yearsExperience).toBe(21);
    expect(result.headline).toBe("SAP Architect");
    expect(result.contact.linkedinUrl).toBe("");
  });

  it("removes list items and sets contact details when selected", () => {
    const result = applyChanges(current, proposed, changes, new Set(["coreSkills.remove", "contact.linkedinUrl", "headline"]));
    expect(result.coreSkills).toEqual(["SAP CPI"]);
    expect(result.contact.linkedinUrl).toBe("https://linkedin.example");
    expect(result.headline).toBe("New headline");
  });

  it("doesn't change the original profile", () => {
    const before = structuredClone(current);
    applyChanges(current, proposed, changes, new Set(changes.map((c) => c.id)));
    expect(current).toEqual(before);
  });
});

describe("ProfileSchema", () => {
  it("requires a name and rejects negative experience", () => {
    expect(ProfileSchema.safeParse(EMPTY_PROFILE).success).toBe(false);
    expect(ProfileSchema.safeParse({ ...current, yearsExperience: -1 }).success).toBe(false);
    expect(ProfileSchema.safeParse(current).success).toBe(true);
  });
});
