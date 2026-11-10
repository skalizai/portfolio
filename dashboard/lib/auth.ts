import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { isAllowedEmail } from "@/lib/access";
import { authConfig } from "@/lib/auth.config";
import { verifyPassword } from "@/lib/password";

/** After this many wrong passwords in the window, sign-in is refused until the window passes. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

class TooManyAttempts extends CredentialsSignin {
  code = "locked";
}

/**
 * Checks your email and password. Wrong attempts are counted in the audit log, so the limit holds
 * across server instances. The email that was tried isn't stored.
 */
async function authorize(credentials: Partial<Record<"email" | "password", unknown>>) {
  const email = typeof credentials.email === "string" ? credentials.email.trim() : "";
  const password = typeof credentials.password === "string" ? credentials.password : "";
  const { db } = await import("@/lib/db");

  const since = new Date(Date.now() - LOCKOUT_MS);
  const failures = await db().auditLog.count({ where: { action: "auth.failed", at: { gte: since } } });
  if (failures >= MAX_FAILED_LOGINS) throw new TooManyAttempts();

  const ok = isAllowedEmail(email) && (await verifyPassword(password, process.env.AUTH_PASSWORD_HASH));
  if (!ok) {
    await db().auditLog.create({ data: { action: "auth.failed" } });
    return null;
  }
  await db().auditLog.create({ data: { action: "auth.signed_in" } });
  return { id: "owner", email: process.env.AUTH_ALLOWED_EMAIL!.trim(), name: "Owner" };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [Credentials({ credentials: { email: { type: "email" }, password: { type: "password" } }, authorize })],
  callbacks: {
    signIn: ({ user }) => isAllowedEmail(user.email),
  },
});

/** For route handlers: a second check behind middleware. Returns a response when access is refused. */
export async function requireApiSession(): Promise<Response | null> {
  const session = await auth();
  if (isAllowedEmail(session?.user?.email)) return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
