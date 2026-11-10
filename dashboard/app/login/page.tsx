import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth";

export const metadata = { title: "Sign in · Job Dashboard" };

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-txt";

const MESSAGES: Record<string, string> = {
  CredentialsSignin: "That email and password don't match. Please try again.",
  locked: "Too many wrong attempts. Please wait 15 minutes, then try again.",
};

async function login(formData: FormData) {
  "use server";
  try {
    await signIn("credentials", { email: formData.get("email"), password: formData.get("password"), redirectTo: "/" });
  } catch (error) {
    // A successful sign-in also ends in a thrown redirect, which must be passed on.
    if (error instanceof AuthError) {
      redirect(`/login?error=${error instanceof CredentialsSignin && error.code === "locked" ? "locked" : "CredentialsSignin"}`);
    }
    throw error;
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main className="bg-glow flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[2rem] border border-line bg-surface p-6 sm:p-8">
        <p className="flex items-center gap-2 font-display text-lg font-semibold">
          <span aria-hidden className="bg-gradient-accent size-2.5 rounded-full" />
          <span>
            Sohail<span className="text-accent-text">/jobs</span>
          </span>
        </p>
        <h1 className="mt-6 text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-dim">This is a private dashboard for one account.</p>
        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-line-strong p-3 text-sm">
            {MESSAGES[error] ?? "Sign-in failed. Please try again."}
          </p>
        )}
        <form className="mt-6 space-y-4" action={login}>
          <label className="block text-sm">
            Email
            <input className={FIELD} type="email" name="email" autoComplete="username" required />
          </label>
          <label className="block text-sm">
            Password
            <input className={FIELD} type="password" name="password" autoComplete="current-password" required />
          </label>
          <Button type="submit" className="h-11 w-full rounded-xl">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
