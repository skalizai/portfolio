import { z } from "zod";

export const DEFAULT_SPONSORSHIP_TERM = "visa sponsorship";

export const SponsorshipRuleSchema = z.object({
  country: z.string().trim().min(1, "Enter a country").max(100, "Country names must be 100 characters or fewer"),
  term: z.string().trim().max(100, "Search phrases must be 100 characters or fewer"),
  onlyIfMentioned: z.boolean(),
});

export const SponsorshipRulesSchema = z
  .array(SponsorshipRuleSchema)
  .max(30, "You can add up to 30 countries")
  .refine((rules) => new Set(rules.map((rule) => rule.country.toLowerCase())).size === rules.length, "Each country can only be listed once");

export type SponsorshipRule = z.infer<typeof SponsorshipRuleSchema>;

/** The phrase to search for and check, with the usual one when none is given. */
export const termOf = (rule: Pick<SponsorshipRule, "term">) => rule.term.trim() || DEFAULT_SPONSORSHIP_TERM;

/** The alternatives in a phrase, separated by commas or semicolons. Any one of them counts. */
export const alternativesOf = (rule: Pick<SponsorshipRule, "term">) =>
  termOf(rule)
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);

/** Only the first alternative goes into the search, because long searches find very little. */
export const searchPhraseOf = (rule: Pick<SponsorshipRule, "term">) => alternativesOf(rule)[0] ?? DEFAULT_SPONSORSHIP_TERM;

/** Rules saved in Settings, or else the countries listed on the profile before rules existed. */
export function resolveSponsorshipRules(saved: unknown, profileCountries: string[]): SponsorshipRule[] {
  const parsed = SponsorshipRulesSchema.safeParse(saved);
  if (saved !== null && saved !== undefined && parsed.success) return parsed.data;
  return profileCountries.map((country) => ({ country, term: DEFAULT_SPONSORSHIP_TERM, onlyIfMentioned: false }));
}
