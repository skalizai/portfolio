import type { Profile } from "@/lib/profile/schema";
import { alternativesOf, resolveSponsorshipRules, type SponsorshipRule } from "@/lib/search/sponsorship";

export type FilterableJob = {
  title: string;
  location: string | null;
  workMode: string | null;
  postedAt: Date | null;
  description?: string;
};

export type FilterResult = { reason: string; seniorityFit: "under" | "fit"; locationFit: boolean };

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Places in the same market. Searching for any one of them accepts jobs in all of them. */
const MARKETS = [
  ["uae", "united arab emirates", "dubai", "abu dhabi", "sharjah", "ajman", "ras al", "fujairah", "umm al", "al ain"],
  ["saudi", "ksa", "riyadh", "jeddah", "dammam", "khobar", "neom"],
  ["qatar", "doha"],
  ["oman", "muscat"],
  ["bahrain", "manama"],
  ["kuwait"],
  // States as well as cities, because listings often give only a suburb, like "Beenleigh QLD 4207".
  ["australia", "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra", "nsw", "new south wales", "vic", "victoria", "qld", "queensland", "wa", "tas", "tasmania", "act", "australian capital territory"],
  ["new zealand", "auckland", "wellington", "christchurch", "hamilton", "tauranga", "dunedin", "canterbury", "waikato", "otago"],
  ["singapore"],
  ["malaysia", "kuala lumpur", "selangor", "penang", "johor", "cyberjaya", "putrajaya", "petaling jaya"],
];

const BELOW_SENIOR = /\b(junior|jr|intern|internship|trainee|graduate|entry[- ]level|mid[- ]level|associate(?! (director|partner|principal|vice)))\b/i;

const containsWord = (text: string, word: string) =>
  new RegExp(`(^|[^a-z0-9])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text);

/** Whether a job's location falls within a place, or within the same market as that place. */
function isInPlace(location: string, place: string): boolean {
  const name = place.toLowerCase().trim();
  const market = MARKETS.find((terms) => terms.some((term) => containsWord(name, term)));
  return (market ?? [name]).some((term) => containsWord(location, term));
}

// Listings often mention sponsorship only to refuse it.
const REFUSES_SPONSORSHIP = [
  /\b(no|not|unable|cannot|can't|can not|won't|will not|without|doesn't|does not|do not|don't)\b[^.\n]{0,60}\b(sponsor|visa)/i,
  /\b(sponsor\w*|visas?)\b[^.\n]{0,40}\b(not|unavailable|isn't|cannot)\b/i,
];

export type SponsorshipPreferences = Pick<Profile["preferences"], "visaSponsorshipLocations"> & { sponsorshipRules?: SponsorshipRule[] };

const VISA_WORDS = /\b(visas?|sponsor\w*)\b/i;
const isVisaTerm = (term: string) => VISA_WORDS.test(term);

/** The rule for a job's country, if you have one there. */
export function sponsorshipRuleFor(job: Pick<FilterableJob, "location">, preferences: SponsorshipPreferences): SponsorshipRule | null {
  const location = job.location?.toLowerCase();
  if (!location) return null;
  const rules = preferences.sponsorshipRules ?? resolveSponsorshipRules(null, preferences.visaSponsorshipLocations);
  return rules.find((rule) => isInPlace(location, rule.country)) ?? null;
}

/**
 * For a job in a country with a rule: whether its listing refuses sponsorship, says nothing about
 * what you need, or mentions it. A rule can list alternatives separated by commas, and any one of
 * them counts. One about visas or sponsorship matches any mention of either; any other, such as
 * "Employment Pass" or "EP", has to appear as a whole word or phrase. Null for any other job.
 */
export function sponsorshipStatus(
  job: Pick<FilterableJob, "title" | "location" | "description">,
  preferences: SponsorshipPreferences,
): "refused" | "unmentioned" | "mentioned" | null {
  const rule = sponsorshipRuleFor(job, preferences);
  if (!rule) return null;

  const text = `${job.title}\n${job.description ?? ""}`;
  const alternatives = alternativesOf(rule);
  const visaMentioned = alternatives.some(isVisaTerm) && VISA_WORDS.test(text);
  const otherMentioned = alternatives.some((alternative) => !isVisaTerm(alternative) && containsWord(text, alternative));
  if (!visaMentioned && !otherMentioned) return "unmentioned";
  // A refusal only counts when nothing else you accept, such as an Employment Pass, is offered.
  return !otherMentioned && REFUSES_SPONSORSHIP.some((pattern) => pattern.test(text)) ? "refused" : "mentioned";
}

/** Jobs a rule set to "only show jobs that mention it" leaves out. */
export function hiddenBySponsorshipRule(job: Pick<FilterableJob, "title" | "location" | "description">, preferences: SponsorshipPreferences): boolean {
  return Boolean(sponsorshipRuleFor(job, preferences)?.onlyIfMentioned) && sponsorshipStatus(job, preferences) === "unmentioned";
}

function isWantedLocation(job: FilterableJob, wanted: string[]): boolean {
  const location = job.location?.toLowerCase().trim();
  // With no location stated, or "Anywhere", there's nothing to rule the job out on.
  if (!location || location === "anywhere" || job.workMode === "remote") return true;

  return wanted.some((place) => {
    if (place.toLowerCase().trim() === "remote") return false;
    return isInPlace(location, place);
  });
}

/**
 * The checks that don't need Claude. Words are only looked for in the title, because a senior
 * role's description often says something like "mentor junior developers".
 */
export function hardFilter(
  job: FilterableJob,
  preferences: Profile["preferences"] & { sponsorshipRules?: SponsorshipRule[] },
  wantedLocations: string[],
  now: Date,
): FilterResult | null {
  const excluded = preferences.excludeKeywords.find((word) => containsWord(job.title, word));
  if (excluded) return { reason: `The title contains "${excluded}", which you've excluded.`, seniorityFit: "fit", locationFit: true };

  if (preferences.minSeniority && BELOW_SENIOR.test(job.title)) {
    return { reason: `The title suggests a role below ${preferences.minSeniority} level.`, seniorityFit: "under", locationFit: true };
  }

  if (!isWantedLocation(job, wantedLocations)) {
    return { reason: `${job.location} isn't in your search locations.`, seniorityFit: "fit", locationFit: false };
  }

  const sponsorship = sponsorshipStatus(job, preferences);
  if (sponsorship === "refused") {
    return { reason: "This listing says visa sponsorship isn't available, and you need it in this country.", seniorityFit: "fit", locationFit: false };
  }
  const rule = sponsorshipRuleFor(job, preferences);
  if (rule?.onlyIfMentioned && sponsorship === "unmentioned") {
    return { reason: `The listing doesn't mention ${alternativesOf(rule).map((alternative) => `"${alternative}"`).join(" or ")}, which you need for jobs in ${rule.country}.`, seniorityFit: "fit", locationFit: false };
  }

  if (job.postedAt && now.getTime() - job.postedAt.getTime() > MAX_AGE_MS) {
    return { reason: "Posted more than 30 days ago.", seniorityFit: "fit", locationFit: true };
  }

  return null;
}
