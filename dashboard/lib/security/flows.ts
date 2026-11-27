import { z } from "zod";
import { isAllowedEmail } from "@/lib/access";
import { db } from "@/lib/db";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/password";
import { checkCode, CODE_TTL_MS, issueCode, withdrawCode, type CodePurpose } from "@/lib/security/codes";
import { currentPasswordHash, savePasswordHash, signOutEverywhere } from "@/lib/security/credentials";
import { maskEmail, primaryEmail, sendSecurityEmail } from "@/lib/security/email";

type Fail = { ok: false; error: string; status: number };

const WRONG_CURRENT_LIMIT = 5;
const WRONG_CURRENT_WINDOW_MS = 15 * 60 * 1000;

export const NewPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200, "That's longer than needed; 200 characters at most");

const minutes = CODE_TTL_MS / 60_000;
const log = (action: string, payload?: object) => db().auditLog.create({ data: { action, ...(payload ? { payload } : {}) } });

async function sendCode(purpose: CodePurpose, intro: string, payload: object | null): Promise<{ ok: true; sentTo: string } | Fail> {
  const issued = await issueCode(purpose, payload);
  if (!issued.ok) return issued;
  const sent = await sendSecurityEmail({
    subject: `Your dashboard code: ${issued.code}`,
    text: `${intro}\n\nYour code is ${issued.code}\n\nIt works for ${minutes} minutes. If you didn't ask for this, ignore this email; nothing changes. Someone may know your current password, though, so consider changing it from Security in the dashboard.`,
  });
  if (!sent.ok) {
    await withdrawCode(issued.id);
    return { ok: false, error: sent.error, status: 503 };
  }
  return { ok: true, sentTo: maskEmail(primaryEmail()) };
}

async function finish(passwordHash: string, action: "auth.password_changed" | "auth.password_reset") {
  await savePasswordHash(passwordHash);
  await log(action);
  await sendSecurityEmail({
    subject: action === "auth.password_changed" ? "Your dashboard password was changed" : "Your dashboard password was reset",
    text: `Your dashboard password was ${action === "auth.password_changed" ? "changed" : "reset"} just now, and every device was signed out.\n\nIf this wasn't you, reset it straight away from "Forgot your password?" on the sign-in page.`,
  });
}

/**
 * Step 1 of a change, while signed in: checks your current password and the new one, then emails a
 * code. The new password's hash waits with the code until it's confirmed.
 */
export async function startPasswordChange(current: string, next: string): Promise<{ ok: true; sentTo: string } | Fail> {
  const wrong = await db().auditLog.count({ where: { action: "security.wrong_password", at: { gte: new Date(Date.now() - WRONG_CURRENT_WINDOW_MS) } } });
  if (wrong >= WRONG_CURRENT_LIMIT) return { ok: false, error: "Too many wrong attempts. Please wait 15 minutes, then try again.", status: 429 };
  if (!(await verifyPassword(current, await currentPasswordHash()))) {
    await log("security.wrong_password");
    return { ok: false, error: "Your current password isn't right.", status: 400 };
  }
  const parsed = NewPasswordSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message, status: 400 };
  if (next === current) return { ok: false, error: "The new password is the same as the current one.", status: 400 };
  return sendCode("change-password", "You asked to change your dashboard password.", { passwordHash: await hashPassword(next) });
}

/** Step 2 of a change: the emailed code. Signs out every device, this one included. */
export async function confirmPasswordChange(code: string): Promise<{ ok: true } | Fail> {
  const checked = await checkCode("change-password", code);
  if (!checked.ok) return checked;
  const passwordHash = (checked.payload as { passwordHash?: string } | null)?.passwordHash;
  if (!passwordHash) return { ok: false, error: "That code has expired. Please start again.", status: 400 };
  await finish(passwordHash, "auth.password_changed");
  return { ok: true };
}

/**
 * Step 1 of a reset, while signed out. The answer is the same whatever email is typed, so the page
 * doesn't reveal which email is yours; a code only goes out for the right one.
 */
export async function startPasswordReset(email: string): Promise<{ ok: true }> {
  if (isAllowedEmail(email)) {
    const sent = await sendCode("reset-password", "You asked to reset your dashboard password.", null);
    await log(sent.ok ? "security.reset_code_sent" : "security.reset_code_refused");
  }
  return { ok: true };
}

/** Step 2 of a reset: the email again, the code, and the new password. */
export async function confirmPasswordReset(email: string, code: string, next: string): Promise<{ ok: true } | Fail> {
  const parsed = NewPasswordSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message, status: 400 };
  if (!isAllowedEmail(email)) return { ok: false, error: "That code isn't right.", status: 400 };
  const checked = await checkCode("reset-password", code);
  if (!checked.ok) return checked;
  await finish(await hashPassword(next), "auth.password_reset");
  return { ok: true };
}

export async function endAllSessions() {
  await signOutEverywhere();
  await log("auth.signed_out_everywhere");
}

const ACTIVITY_LABELS: Record<string, string> = {
  "auth.signed_in": "Signed in",
  "auth.failed": "Wrong password at sign-in",
  "auth.password_changed": "Password changed",
  "auth.password_reset": "Password reset by email code",
  "auth.signed_out_everywhere": "Signed out everywhere",
  "security.wrong_password": "Wrong current password on the Security page",
  "security.reset_code_sent": "Reset code emailed",
};

/** The latest sign-ins, wrong passwords and changes, newest first. */
export async function recentActivity(limit = 15) {
  const rows = await db().auditLog.findMany({ where: { action: { in: Object.keys(ACTIVITY_LABELS) } }, orderBy: { at: "desc" }, take: limit, select: { id: true, action: true, at: true } });
  return rows.map((r) => ({ id: r.id, at: r.at, label: ACTIVITY_LABELS[r.action]!, warning: r.action === "auth.failed" || r.action === "security.wrong_password" }));
}
