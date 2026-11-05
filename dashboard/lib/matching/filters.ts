import type { Profile } from "@/lib/profile/schema";

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
  ["australia", "sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra"],
  ["new zealand", "auckland", "wellington", "christchurch"],
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

/** Rules out what's clearly wrong for free. Claude judges the unclear cases, like a bare "Sponsorship:". */
function sponsorshipProblem(job: FilterableJob): string | null {
  const text = `${job.title}\n${job.description ?? ""}`;
  if (!/\b(visas?|sponsor\w*)\b/i.test(text)) return "doesn't mention visa sponsorship";
  return REFUSES_SPONSORSHIP.some((pattern) => pattern.test(text)) ? "says visa sponsorship isn't available" : null;
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
  preferences: Profile["preferences"],
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

  const visaPlace = job.location && preferences.visaSponsorshipLocations.find((place) => isInPlace(job.location!.toLowerCase(), place));
  if (visaPlace) {
    const problem = sponsorshipProblem(job);
    if (problem) return { reason: `This listing ${problem}, which you need in ${visaPlace}.`, seniorityFit: "fit", locationFit: false };
  }

  if (job.postedAt && now.getTime() - job.postedAt.getTime() > MAX_AGE_MS) {
    return { reason: "Posted more than 30 days ago.", seniorityFit: "fit", locationFit: true };
  }

  return null;
}
