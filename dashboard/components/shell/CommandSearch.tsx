"use client";

import { CornerDownLeft, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type Place = { href: string; label: string; words: string };

const PLACES: Place[] = [
  { href: "/", label: "Home", words: "dashboard start today" },
  { href: "/household/family", label: "Family", words: "wife children kids passport cnic photos birthday" },
  { href: "/household/family/new", label: "Add a family member", words: "new wife child son daughter" },
  { href: "/household/remittances#new-transfer", label: "Send money home", words: "remittance transfer send pakistan rupees" },
  { href: "/household/expenses", label: "Add an expense", words: "expense spend bill receipt groceries" },
  { href: "/household/payroll", label: "Payroll", words: "salary staff pay run" },
  { href: "/household/employees", label: "Employees", words: "staff driver maid nanny" },
  { href: "/household/advances", label: "Advances", words: "loan advance owed" },
  { href: "/household/payslips", label: "Payslips", words: "slip print" },
  { href: "/household", label: "Household overview", words: "house home budget" },
  { href: "/household/settings", label: "Household settings", words: "rate exchange payday" },
  { href: "/investments", label: "Investments", words: "portfolio stocks wealth shares" },
  { href: "/investments/transactions", label: "Investment transactions", words: "buy sell trade dividend" },
  { href: "/investments/accounts", label: "Investment accounts", words: "broker account" },
  { href: "/matches", label: "Job matches", words: "jobs career search" },
  { href: "/applications", label: "Applications", words: "jobs applied interview" },
  { href: "/profile", label: "Profile and CV", words: "cv resume" },
  { href: "/settings", label: "Job search settings", words: "keywords search" },
  { href: "/logs", label: "Logs", words: "runs history" },
  { href: "/security", label: "Security", words: "password change sign out code" },
];

/** "Search or type a command": jumps to a page by name or by what you want to do. Ctrl+K or ⌘K focuses it. */
export function CommandSearch() {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const id = useId();

  const results = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return PLACES.filter((p) => words.every((w) => `${p.label} ${p.words}`.toLowerCase().includes(w))).slice(0, 6);
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative w-full max-w-md"
      onSubmit={(event) => {
        event.preventDefault();
        if (!results[0]) return;
        setQuery("");
        router.push(results[0].href);
      }}
    >
      <label htmlFor={`${id}-q`} className="sr-only">
        Search or type a command
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-dim" />
      <input
        ref={input}
        id={`${id}-q`}
        type="search"
        autoComplete="off"
        placeholder="Search or type a command"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.key === "Escape" && setQuery("")}
        className="h-12 w-full rounded-2xl border border-line bg-surface pr-16 pl-11 text-sm placeholder:text-dim focus:border-line-strong"
      />
      <kbd aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md bg-surface-2 px-2 py-1 font-mono text-[11px] text-dim">
        Ctrl K
      </kbd>
      {query.trim() && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl border border-line bg-surface p-2 shadow-2xl shadow-black/40">
          {results.length ? (
            <ul aria-label="Matching pages">
              {results.map((place, index) => (
                <li key={place.href}>
                  <Link href={place.href} onClick={() => setQuery("")} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-surface-2">
                    {place.label}
                    {index === 0 && (
                      <span className="flex items-center gap-1 text-xs text-dim">
                        <CornerDownLeft aria-hidden className="size-3.5" />
                        <span className="sr-only">Press</span> Enter
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2.5 text-sm text-dim">Nothing matches &ldquo;{query.trim()}&rdquo;.</p>
          )}
        </div>
      )}
    </form>
  );
}
