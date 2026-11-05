import { createHash } from "node:crypto";

const COMPANY_SUFFIXES = /\b(l\.?l\.?c|fz-?llc|fz-?e|fzco|dmcc|pjsc|plc|ltd|limited|inc|incorporated|corp|corporation|gmbh|co|company|group|holding|holdings|middle east|me)\b\.?/g;

const FUZZY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const TITLE_SIMILARITY = 0.85;

function normalise(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/s\/4\s*hana/g, "s4hana")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normaliseCompany(company: string): string {
  const stripped = company.toLowerCase().replace(COMPANY_SUFFIXES, " ");
  // A name made only of suffixes ("Group Ltd") is better kept whole than erased.
  return normalise(stripped) || normalise(company);
}

export function dedupeHash(job: { company: string; title: string; location: string | null }): string {
  const key = [normaliseCompany(job.company), normalise(job.title), normalise(job.location)].join("|");
  return createHash("sha256").update(key).digest("hex");
}

/** Share of title words in common, from 0 to 1. */
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(normalise(a).split(" ").filter(Boolean));
  const right = new Set(normalise(b).split(" ").filter(Boolean));
  if (!left.size || !right.size) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return (2 * shared) / (left.size + right.size);
}

/** Different cities are different jobs, but "Dubai" and "Dubai, UAE" are the same place. */
function locationsCompatible(a: string | null, b: string | null): boolean {
  const left = normalise(a);
  const right = normalise(b);
  return !left || !right || left.includes(right) || right.includes(left);
}

type Comparable = { company: string; title: string; location: string | null; seenAt: Date };

/** The same job listed slightly differently, such as on two boards. */
export function isFuzzyDuplicate(a: Comparable, b: Comparable): boolean {
  return (
    Math.abs(a.seenAt.getTime() - b.seenAt.getTime()) <= FUZZY_WINDOW_MS &&
    normaliseCompany(a.company) === normaliseCompany(b.company) &&
    locationsCompatible(a.location, b.location) &&
    titleSimilarity(a.title, b.title) >= TITLE_SIMILARITY
  );
}
