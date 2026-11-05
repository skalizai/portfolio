import type { Profile } from "@/lib/profile/schema";

export const MAX_KEYWORD_SCORE = 40;
/** Below this, a job shares too little with the profile to be worth paying Claude to score. */
export const MIN_KEYWORD_SCORE = 10;

const HIGH_VALUE = /cpi|integration suite|s\/4|abap|rise|btp/i;
const HIGH_POINTS = 8;
const SKILL_POINTS = 3;
const MODULE_POINTS = 2;

/** "SAP CPI / Integration Suite" becomes CPI and Integration Suite. S/4HANA stays in one piece. */
function termsOf(skill: string): string[] {
  const terms = skill
    .split(/\s*\/\s*(?!4)|[(),]/)
    .map((term) => term.trim().replace(/^SAP\s+/i, ""))
    .filter((term) => term.length >= 2);
  if (/integration suite/i.test(skill)) terms.push("Cloud Integration");
  if (/^rise\b/i.test(skill)) terms.push("RISE");
  return terms;
}

function mentions(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Short names like SD or PP are only meaningful in capitals.
  const flags = term.length <= 3 || term === "RISE" ? "" : "i";
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, flags).test(text);
}

const titleWords = (title: string) =>
  new Set((title.toLowerCase().match(/[a-z0-9/]+/g) ?? []).map((word) => word.replace(/s$/, "")));

/**
 * True when the title contains every word of a target title, in any order. Some listings are only
 * a few lines long, so a job with the right title shouldn't be dropped for what its text leaves out.
 */
export function matchesTargetTitle(title: string, targetTitles: string[]): boolean {
  const words = titleWords(title);
  return targetTitles.some((target) => {
    const wanted = [...titleWords(target)];
    return wanted.length > 0 && wanted.every((word) => words.has(word));
  });
}

/** Weighted overlap between the job's text and the profile, from 0 to 40. */
export function keywordScore(job: { title: string; description: string }, profile: Pick<Profile, "coreSkills" | "modules">): number {
  const text = `${job.title}\n${job.description}`.replace(/\bS\s*\/?\s*4\s*-?\s*HANA\b/gi, "S/4HANA");
  const found = (item: string) => termsOf(item).some((term) => mentions(text, term));

  const points =
    profile.coreSkills.filter(found).reduce((sum, skill) => sum + (HIGH_VALUE.test(skill) ? HIGH_POINTS : SKILL_POINTS), 0) +
    profile.modules.filter(found).length * MODULE_POINTS;

  return Math.min(MAX_KEYWORD_SCORE, points);
}
