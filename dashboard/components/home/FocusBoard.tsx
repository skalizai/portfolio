"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const FOCUS = [
  { value: "all", label: "Everything" },
  { value: "family", label: "Family" },
  { value: "money", label: "Money sent" },
  { value: "household", label: "Household" },
  { value: "investments", label: "Investments" },
  { value: "career", label: "Career" },
] as const;

/**
 * "Focus on": big chips that narrow Home to one area of life. Cards mark themselves with data-area,
 * and a stylesheet rule hides the rest.
 */
export function FocusBoard({ children }: { children: ReactNode }) {
  const [focus, setFocus] = useState<(typeof FOCUS)[number]["value"]>("all");
  return (
    <section aria-labelledby="focus-title" className="mt-10">
      <h2 id="focus-title" className="text-lg font-semibold">
        Focus on
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {FOCUS.map(({ value, label }) => (
          <li key={value}>
            <button
              type="button"
              aria-pressed={focus === value}
              onClick={() => setFocus(value)}
              className={cn(
                "h-14 w-full cursor-pointer rounded-2xl px-4 text-sm font-semibold transition",
                focus === value
                  ? "bg-chip text-on-accent shadow-[0_12px_30px_-12px] shadow-chip"
                  : "border border-line bg-surface-2/70 text-txt hover:-translate-y-0.5 hover:border-line-strong",
              )}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
      <div data-focus={focus} className="focus-board mt-8">
        {children}
      </div>
    </section>
  );
}
