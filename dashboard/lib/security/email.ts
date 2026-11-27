import { appendFileSync } from "node:fs";

export type SecurityEmail = { to: string; subject: string; text: string };

/** Your primary email: the one you sign in with, where codes and alerts go. */
export const primaryEmail = () => process.env.AUTH_ALLOWED_EMAIL?.trim() || null;

/** "a••••i@yahoo.com", so the page doesn't show your full address. */
export function maskEmail(email: string | null) {
  if (!email) return "–";
  const [name = "", domain = ""] = email.split("@");
  const shown = name.length <= 2 ? name[0] ?? "" : `${name[0]}${"•".repeat(Math.min(name.length - 2, 6))}${name[name.length - 1]}`;
  return `${shown}@${domain}`;
}

/** The sender address from DIGEST_FROM, if one is set, or Resend's shared address. */
function sender() {
  const configured = process.env.DIGEST_FROM?.match(/<([^>]+)>/)?.[1] ?? process.env.DIGEST_FROM?.trim();
  return `Dashboard security <${configured || "onboarding@resend.dev"}>`;
}

/**
 * Sends through Resend. Browser tests have no Resend key; they set SECURITY_EMAIL_OUTBOX to a file
 * instead, and read the code from there. That file is never used when a Resend key is set.
 */
export async function sendSecurityEmail(email: Omit<SecurityEmail, "to">): Promise<{ ok: true } | { ok: false; error: string }> {
  const to = primaryEmail();
  if (!to) return { ok: false, error: "No primary email is set up." };
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    const outbox = process.env.SECURITY_EMAIL_OUTBOX;
    if (!outbox) return { ok: false, error: "Email isn't set up on this server, so a code can't be sent." };
    appendFileSync(outbox, `${JSON.stringify({ to, ...email })}\n`);
    return { ok: true };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: sender(), to: [to], subject: email.subject, text: email.text }),
  }).catch(() => null);
  return response?.ok ? { ok: true } : { ok: false, error: "The email couldn't be sent just now. Please try again in a minute." };
}
