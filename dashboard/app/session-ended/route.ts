import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const NOTICES = new Set(["changed", "reset", "everywhere", "expired"]);

/**
 * Clears this browser's session cookie and goes to sign-in, with a note saying why. Used after a
 * password change, "sign out everywhere", or when a session from before one of those turns up.
 */
export async function GET(request: Request) {
  const reason = new URL(request.url).searchParams.get("reason") ?? "expired";
  const jar = await cookies();
  for (const cookie of jar.getAll()) {
    if (/^(__Secure-)?authjs\.session-token(\.\d+)?$/.test(cookie.name)) jar.delete(cookie.name);
  }
  return NextResponse.redirect(new URL(`/login?notice=${NOTICES.has(reason) ? reason : "expired"}`, request.url));
}
