import type { NextAuthConfig } from "next-auth";

/**
 * The parts of the sign-in setup that middleware needs to read a session. Kept free of the database
 * and the password check, so it can run in the middleware runtime.
 */
export const authConfig = {
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
} satisfies NextAuthConfig;
