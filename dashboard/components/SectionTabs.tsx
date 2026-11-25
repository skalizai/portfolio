"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HOUSEHOLD_LINKS, INVESTMENT_LINKS } from "@/lib/nav";
import { cn } from "@/lib/utils";

const SECTIONS = { investments: INVESTMENT_LINKS, household: HOUSEHOLD_LINKS };

/**
 * Tabs for a section. The first tab is the section's home, so it's active only on its own page;
 * the others stay active on their sub-pages too, such as one payroll month.
 */
export function SectionTabs({ section, label }: { section: keyof typeof SECTIONS; label: string }) {
  const pathname = usePathname();
  const links = SECTIONS[section];
  return (
    <nav aria-label={label} className="mt-4">
      <ul className="flex flex-wrap gap-2">
        {links.map(({ href, label: text, icon: Icon }, index) => {
          const active = index === 0 ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-11 items-center gap-2 rounded-full border px-4 text-sm", active ? "border-line-strong bg-surface-2 text-txt" : "border-line text-dim hover:text-txt")}
              >
                <Icon aria-hidden className="size-4 text-brand" />
                {text}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
