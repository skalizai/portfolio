import { LogOut, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MainNav } from "@/components/MainNav";
import { CommandSearch } from "@/components/shell/CommandSearch";
import { SecurityLink, SideNav } from "@/components/shell/SideNav";
import { ThemeSwitch } from "@/components/shell/ThemeSwitch";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { isAllowedEmail } from "@/lib/access";
import { auth, hasCurrentSession, signOut } from "@/lib/auth";
import { maskEmail, primaryEmail } from "@/lib/security/email";

function Brand() {
  return (
    <Link href="/" className="font-display text-xl font-bold tracking-tight">
      Sohail<span className="text-accent-text">~</span>home
    </Link>
  );
}

function SignOut({ className }: { className?: string }) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <Button type="submit" variant="ghost" size="sm" className={className}>
        <LogOut aria-hidden className="size-4" />
        Sign out
      </Button>
    </form>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email)) redirect("/login");
  // A session from before a password change or "sign out everywhere" is cleared, then sent to sign in.
  if (!(await hasCurrentSession())) redirect("/session-ended");

  return (
    <div className="bg-glow min-h-dvh md:flex md:gap-4 md:p-4 print:block print:bg-none print:p-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-40 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* The sidebar, from tablet width up. */}
      <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] w-64 shrink-0 flex-col overflow-y-auto rounded-[1.75rem] border border-line bg-surface p-4 md:flex print:hidden">
        <div className="px-3 pt-2">
          <Brand />
        </div>
        <SideNav />
        <div className="mt-auto flex flex-col gap-3 pt-6">
          <SecurityLink />
          <div className="rounded-2xl border border-line bg-bg/60 p-3">
            <div className="flex items-center gap-3">
              <span className="relative shrink-0">
                <Image src="/profile.jpg" alt="" width={40} height={40} unoptimized className="size-10 rounded-full object-cover" />
                <span aria-hidden className="absolute right-0 bottom-0 size-2.5 rounded-full bg-brand ring-2 ring-surface" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">Sohail</span>
                <span className="block truncate text-xs text-dim">{maskEmail(primaryEmail())}</span>
              </span>
              <span className="rounded-md bg-chip px-1.5 py-0.5 text-[11px] font-semibold text-on-accent">Owner</span>
            </div>
            <SignOut className="mt-3 w-full rounded-xl border border-line" />
          </div>
          <ThemeSwitch />
        </div>
      </aside>

      {/* The top bar on phones. */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur md:hidden print:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Brand />
          <div className="ml-auto flex items-center gap-1">
            <Link href="/security" aria-label="Security" title="Security" className="flex size-9 items-center justify-center rounded-md text-dim hover:bg-surface-2 hover:text-txt">
              <ShieldCheck aria-hidden className="size-5" />
            </Link>
            <ThemeToggle />
            <SignOut />
          </div>
          <div className="w-full min-w-0">
            <MainNav />
          </div>
        </div>
      </header>

      <div className="min-w-0 flex-1 md:rounded-[1.75rem] md:border md:border-line md:bg-surface/40 print:border-0 print:bg-transparent">
        <div className="hidden items-center gap-4 px-8 pt-6 md:flex print:hidden">
          <CommandSearch />
        </div>
        <main id="main" className="mx-auto max-w-6xl px-4 py-6 md:px-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
