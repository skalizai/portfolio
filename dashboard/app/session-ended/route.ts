import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const NOTICES = new Set(["changed", "reset", "everywhere", "expired"]);

/**
 * Clears this browser's session cookie and goes to sign-in, with a note saying why. Used after a
 * password change, "sign out everywhere", or when a session from before one of those turns up.
 */
export async function GET(request: Request) {
  const reason = new URL(request.url).searchParams.get("reason") ?? "expired";
  const response = NextResponse.redirect(new URL(`/login?notice=${NOTICES.has(reason) ? reason : "expired"}`, request.url));
  for (const cookie of (await cookies()).getAll()) {
    if (!/^(__Secure-)?authjs\.session-token(\.\d+)?$/.test(cookie.name)) continue;
    // On https the cookie is "__Secure-…", which a browser only replaces when the replacement is
    // marked secure too; without that the old session cookie would stay.
    response.cookies.set(cookie.name, "", { path: "/", maxAge: 0, expires: new Date(0), httpOnly: true, sameSite: "lax", secure: cookie.name.startsWith("__Secure-") });
  }
  return response;
}
