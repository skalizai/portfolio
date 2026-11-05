/** Words that are capitalised in a letter for reasons other than being a claim. */
const COMMON = new Set(["dear", "hiring", "manager", "team", "yours", "sincerely", "faithfully", "regards", "kind", "best", "i", "i'm", "i've"]);

const normalise = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();

/**
 * Finds numbers and names in generated text that appear nowhere in the given sources. Numbers,
 * acronyms and capitalised words in mid-sentence are where an invented fact would show up, so
 * anything found is shown to you before the text can be used. It can't judge meaning: it would
 * miss a real skill attached to the wrong employer, which is why you still review every draft.
 */
export function findUnsupportedClaims(text: string, sources: string[]): string[] {
  const known = normalise(sources.join("\n"));
  const isKnown = (term: string) => {
    const escaped = normalise(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(known);
  };

  const found = new Set<string>();
  // Numbers, such as 15, 40%, or 2019.
  for (const match of text.matchAll(/\d[\d,.]*\d|\d/g)) {
    // Part of a name such as S/4HANA or SAP R/3 is checked as that name below.
    const before = text[match.index - 1] ?? "";
    const after = text[match.index + match[0].length] ?? "";
    if (/[A-Za-z/]/.test(before) || /[A-Za-z]/.test(after)) continue;
    if (!isKnown(match[0])) found.add(match[0]);
  }
  // Names: anything capitalised, unless it only starts a sentence.
  for (const match of text.matchAll(/[A-Z][A-Za-z0-9&/+-]*/g)) {
    const word = match[0].replace(/[-/+&]+$/, "");
    const preceding = text.slice(0, match.index).trimEnd();
    const startsSentence = preceding === "" || /[.!?:\n,]$/.test(preceding) || /\n\s*$/.test(text.slice(0, match.index));
    const isAcronym = /^[A-Z0-9/&+-]{2,}$/.test(word) || /[A-Z].*[A-Z0-9]/.test(word);
    if (startsSentence && !isAcronym) continue;
    if (COMMON.has(word.toLowerCase()) || word.length < 2) continue;
    if (!isKnown(word)) found.add(word);
  }
  return [...found];
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
