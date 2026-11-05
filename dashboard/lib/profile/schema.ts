import { z } from "zod";

const text = z.string().trim().max(1000);
const list = z.array(z.string().trim().min(1).max(200)).max(200);

export const ProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  headline: text,
  location: text,
  yearsExperience: z.number().int().min(0).max(80),
  currentRole: text,
  contact: z.object({
    email: text,
    phone: text,
    linkedinUrl: text,
    portfolioUrl: text,
  }),
  coreSkills: list,
  modules: list,
  industries: list,
  certifications: list,
  leadership: text,
  targetTitles: list,
  preferences: z.object({
    locations: list,
    workModes: list,
    employmentTypes: list,
    minSeniority: text,
    excludeKeywords: list,
    salaryFloorAED: z.number().int().min(0).nullable(),
    visaSponsorshipLocations: list.default([]),
  }),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const EMPTY_PROFILE: Profile = {
  name: "",
  headline: "",
  location: "",
  yearsExperience: 0,
  currentRole: "",
  contact: { email: "", phone: "", linkedinUrl: "", portfolioUrl: "" },
  coreSkills: [],
  modules: [],
  industries: [],
  certifications: [],
  leadership: "",
  targetTitles: [],
  preferences: {
    locations: [],
    workModes: ["onsite", "hybrid", "remote"],
    employmentTypes: ["full-time", "contract"],
    minSeniority: "Senior",
    excludeKeywords: [],
    salaryFloorAED: null,
    visaSponsorshipLocations: [],
  },
};
