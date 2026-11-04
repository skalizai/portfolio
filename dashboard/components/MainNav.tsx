"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Matches" },
  { href: "/applications", label: "Applications" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
  { href: "/logs", label: "Logs" },
];

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main">
      {/* Wraps rather than scrolls, so every link stays visible at 380 px. */}
      <ul className="flex flex-wrap gap-1">
        {LINKS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-1.5 text-sm",
                  active ? "bg-surface-2 text-txt" : "text-dim hover:text-txt",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
