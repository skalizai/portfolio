import type { ApplyChannel } from "@/lib/generated/prisma/enums";

const ATS_HOSTS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "myworkdaysite.com",
  "smartrecruiters.com",
  "bamboohr.com",
  "successfactors.com",
  "successfactors.eu",
  "taleo.net",
  "icims.com",
  "workable.com",
];

/** Boards that sit between you and the employer, so they say nothing about how to apply. */
const JOB_BOARD_HOSTS = ["indeed.com", "glassdoor.com", "bayt.com", "naukrigulf.com", "gulftalent.com", "monster.com", "ziprecruiter.com", "jooble.org"];

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
/**
 * Applications go to whatever address this finds, so it has to be sure. The words right before the
 * address must say to send a CV or application there. Listings are full of other addresses, such
 * as for reporting fraud or asking for adjustments, and those often mention applying too.
 */
const APPLY_INSTRUCTIONS = [
  // "Email your resume to", "Please share your updated CV at", "Forward your application to:"
  /\b(?:e-?mail|send|submit|forward|share|mail|drop)\b[^.!?\n]{0,50}\b(?:cvs?|resumes?|résumés?|applications?)\b[^.!?\n]{0,30}\b(?:to|at|on)\s*:?\s*$/i,
  // "CVs should be sent to"
  /\b(?:cvs?|resumes?|résumés?|applications?)\b[^.!?\n]{0,30}\b(?:sent|submitted|forwarded|emailed)\s+to\s*:?\s*$/i,
  // "CVs to:"
  /\b(?:cvs?|resumes?|résumés?|applications?)\s+to\s*:?\s*$/i,
  // "To apply, email", "Apply by email:", "Apply at"
  /\bapply\b[^.!?\n]{0,30}(?:\b(?:by|via)\s+e-?mail\b[^.!?\n]{0,10}|\be-?mail\s*(?:us\s*)?(?:at|to|on)?\s*:?\s*|\b(?:at|to)\s*:?\s*)$/i,
];
/** Clauses about something other than applying, even where they mention an application. */
const NOT_APPLYING = /\b(adjustments?|accommodations?|accessib\w*|disabilit\w*|suspicious|fraud\w*|scam\w*|verify|authentic\w*|questions?|queries|assistance|help|complaints?|privacy|concerns?|issues?|problems?|difficult\w*|request|contact us|get in touch)\b/i;
const IGNORED_EMAIL = /^(no-?reply|do-?not-?reply|privacy|dpo|legal|abuse|support|info@example)|@(example|email|domain)\./i;

/** Job text is untrusted, and these links get opened later, so only web links are kept. */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function hostMatches(url: string, hosts: string[]): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Finds an address the posting asks you to apply to, ignoring others it happens to mention. */
export function findApplyEmail(description: string): string | null {
  for (const match of description.matchAll(EMAIL)) {
    const email = match[0];
    if (IGNORED_EMAIL.test(email)) continue;
    const before = description.slice(Math.max(0, match.index - 120), match.index);
    const clause = before.split(/[.!?\n]/).at(-1) ?? "";
    if (!NOT_APPLYING.test(clause) && APPLY_INSTRUCTIONS.some((pattern) => pattern.test(clause))) return email.toLowerCase();
  }
  return null;
}

/** The listing's own words around an address, so you can see why it was chosen before sending. */
export function applyEmailContext(description: string, email: string | null): string | null {
  if (!email) return null;
  const index = description.toLowerCase().indexOf(email.toLowerCase());
  if (index < 0) return null;
  const before = description.slice(Math.max(0, index - 120), index);
  const start = Math.max(before.lastIndexOf("."), before.lastIndexOf("\n")) + 1;
  return `${before.slice(start)}${description.slice(index, index + email.length + 30)}`.replace(/\s+/g, " ").trim();
}

export function channelForUrl(url: string | null): ApplyChannel {
  if (!url) return "UNKNOWN";
  if (hostMatches(url, ["linkedin.com"])) return "LINKEDIN_EASY_APPLY";
  if (hostMatches(url, ATS_HOSTS)) return "ATS_FORM";
  if (hostMatches(url, JOB_BOARD_HOSTS)) return "UNKNOWN";
  return "COMPANY_SITE";
}

const RANK: Record<ApplyChannel, number> = {
  ATS_FORM: 0,
  COMPANY_SITE: 1,
  LINKEDIN_EASY_APPLY: 2,
  UNKNOWN: 3,
  EMAIL: 4,
};

/**
 * Picks the most direct way to apply: an email address in the posting first, then the
 * employer's own systems, then LinkedIn, then job boards.
 */
export function detectChannel(input: {
  description: string;
  applyUrls: Array<string | null | undefined>;
}): { applyChannel: ApplyChannel; applyUrl: string | null; applyEmail: string | null } {
  const urls = input.applyUrls.map(safeUrl).filter((u): u is string => u !== null);
  const best = urls
    .map((url, order) => ({ url, order, channel: channelForUrl(url) }))
    .sort((a, b) => RANK[a.channel] - RANK[b.channel] || a.order - b.order)[0];

  const applyEmail = findApplyEmail(input.description);
  return {
    applyChannel: applyEmail ? "EMAIL" : (best?.channel ?? "UNKNOWN"),
    applyUrl: best?.url ?? null,
    applyEmail,
  };
}
