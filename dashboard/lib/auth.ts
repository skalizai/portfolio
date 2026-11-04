import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { isAllowedEmail } from "@/lib/access";

/**
 * JWT sessions with no database adapter keep this file safe to import from
 * middleware, and let login work before the database is configured.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
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
