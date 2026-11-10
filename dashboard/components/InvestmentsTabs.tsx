"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { INVESTMENT_LINKS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function InvestmentsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Investments" className="mt-4">
      <ul className="flex flex-wrap gap-2">
        {INVESTMENT_LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn("flex h-11 items-center gap-2 rounded-full border px-4 text-sm", active ? "border-line-strong bg-surface-2 text-txt" : "border-line text-dim hover:text-txt")}
              >
                <Icon aria-hidden className="size-4 text-brand" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
