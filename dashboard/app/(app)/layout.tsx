import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MainNav } from "@/components/MainNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { isAllowedEmail } from "@/lib/access";
import { auth, signOut } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email)) redirect("/login");

  return (
    <div className="bg-glow min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-30 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold">
            <span aria-hidden className="bg-gradient-accent size-2.5 rounded-full" />
            <span>
              Sohail<span className="text-accent-text">/jobs</span>
            </span>
          </Link>
          <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1">
            <MainNav />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
