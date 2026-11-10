import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { decideAccess } from "@/lib/access";
import { authConfig } from "@/lib/auth.config";

// Only reads the session, so it uses the light config without the database or password check.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const decision = decideAccess({
    pathname: req.nextUrl.pathname,
    email: req.auth?.user?.email,
    authorization: req.headers.get("authorization"),
  });

  switch (decision) {
    case "allow":
      return NextResponse.next();
    case "unauthorized":
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    case "redirect-home":
      return NextResponse.redirect(new URL("/", req.nextUrl));
    case "redirect-login":
      return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
