import { AuthError, CredentialsSignin } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth";

export const metadata = { title: "Sign in · Sohail · Home" };

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-txt";

const MESSAGES: Record<string, string> = {
  CredentialsSignin: "That email and password don't match. Please try again.",
  locked: "Too many wrong attempts. Please wait 15 minutes, or reset your password with a code sent to your email.",
};

const NOTICES: Record<string, string> = {
  changed: "Your password was changed. Sign in with the new one.",
  reset: "Your password was reset. Sign in with the new one.",
  everywhere: "You were signed out on every device.",
  expired: "Your session ended, because the password changed or every device was signed out. Please sign in again.",
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

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;

  return (
    <main className="bg-glow flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[2rem] border border-line bg-surface p-6 sm:p-8">
        <p className="flex items-center gap-2 font-display text-lg font-semibold">
          <span aria-hidden className="bg-gradient-accent size-2.5 rounded-full" />
          <span>
            Sohail<span className="text-accent-text">/home</span>
          </span>
        </p>
        <h1 className="mt-6 text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-dim">This is a private dashboard for one account.</p>
        {notice && NOTICES[notice] && !error && (
          <p role="status" className="mt-4 rounded-xl border border-line-strong p-3 text-sm">
            {NOTICES[notice]}
          </p>
        )}
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
        <p className="mt-4 text-center text-sm">
          <Link href="/login/reset" className="text-dim underline hover:text-txt">
            Forgot your password?
          </Link>
        </p>
      </div>
    </main>
  );
}
