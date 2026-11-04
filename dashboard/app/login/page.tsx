import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth";

export const metadata = { title: "Sign in · Job Match Dashboard" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6">
        <h1 className="text-2xl font-semibold">Job Match Dashboard</h1>
        <p className="mt-2 text-sm text-dim">This is a private dashboard for one account.</p>
        {error && (
          <p role="alert" className="mt-4 rounded-md border border-line-strong p-3 text-sm">
            {error === "AccessDenied"
              ? "That account isn't allowed to sign in here."
              : "Sign-in failed. Please try again."}
          </p>
        )}
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
        >
          <Button type="submit" className="w-full">
            Sign in with GitHub
          </Button>
        </form>
      </div>
    </main>
  );
}
