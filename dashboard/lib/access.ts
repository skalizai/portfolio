/**
 * Access rules for every request, kept free of framework imports so they can be
 * unit-tested directly. Everything is private unless listed here.
 */

export type AccessDecision = "allow" | "redirect-login" | "redirect-home" | "unauthorized";

/** Fails closed: with no allowed email configured, nobody gets in. */
export function isAllowedEmail(
  email: string | null | undefined,
  allowed: string | null | undefined = process.env.AUTH_ALLOWED_EMAIL,
): boolean {
  const expected = allowed?.trim().toLowerCase();
  if (!expected || !email) return false;
  return email.trim().toLowerCase() === expected;
}

/** Compares without exiting early on the first differing character. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Fails closed: an empty or unset secret never matches. */
export function isValidCronRequest(
  authorization: string | null | undefined,
  secret: string | null | undefined = process.env.CRON_SECRET,
): boolean {
  if (!secret || !authorization) return false;
  return safeEqual(authorization, `Bearer ${secret}`);
}

/** The scheduler has no browser session, so these paths alone also accept the cron secret. */
const CRON_PATHS = ["/api/jobs/fetch", "/api/jobs/score"];

export function decideAccess(input: {
  pathname: string;
  email: string | null | undefined;
  authorization?: string | null;
  allowedEmail?: string | null;
  cronSecret?: string | null;
}): AccessDecision {
  const { pathname, email, authorization } = input;
  const allowedEmail = "allowedEmail" in input ? input.allowedEmail : process.env.AUTH_ALLOWED_EMAIL;
  const cronSecret = "cronSecret" in input ? input.cronSecret : process.env.CRON_SECRET;

  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) return "allow";

  const signedIn = isAllowedEmail(email, allowedEmail);

  if (pathname === "/login") return signedIn ? "redirect-home" : "allow";
  if (signedIn) return "allow";

  if (CRON_PATHS.includes(pathname) && isValidCronRequest(authorization, cronSecret)) return "allow";

  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  return isApi ? "unauthorized" : "redirect-login";
}
