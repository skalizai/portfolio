"use client";

import { Heart, House, LayoutGrid, ShieldCheck, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { DASHBOARD_LINKS } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>>; active: (path: string) => boolean };

const LIFE: Item[] = [
  { href: "/", label: "Home", icon: LayoutGrid, active: (p) => p === "/" },
  { href: "/household/family", label: "Family", icon: Heart, active: (p) => p.startsWith("/household/family") },
  { href: "/household", label: "Household", icon: House, active: (p) => p.startsWith("/household") && !p.startsWith("/household/family") },
  { href: "/investments", label: "Investments", icon: TrendingUp, active: (p) => p.startsWith("/investments") },
];

function NavLink({ item, pathname }: { item: Item; pathname: string }) {
  const active = item.active(pathname);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
        active ? "bg-surface-2 font-medium text-txt" : "text-dim hover:bg-surface-2/60 hover:text-txt",
      )}
    >
      <Icon aria-hidden className={cn("size-[18px]", active ? "text-txt" : "text-dim")} />
      {item.label}
    </Link>
  );
}

/** The sidebar's links: the areas of life first, then the job search pages under Career. */
export function SideNav() {
  const pathname = usePathname();
  const career: Item[] = DASHBOARD_LINKS.map((l) => ({ ...l, active: (p: string) => p.startsWith(l.href) }));
  return (
    <nav aria-label="Main" className="mt-8 flex flex-col gap-6">
      <ul className="flex flex-col gap-1">
        {LIFE.map((item) => (
          <li key={item.href}>
            <NavLink item={item} pathname={pathname} />
          </li>
        ))}
      </ul>
      <div>
        <p className="px-3 font-mono text-[11px] tracking-widest text-dim uppercase">Career</p>
        <ul className="mt-2 flex flex-col gap-1">
          {career.map((item) => (
            <li key={item.href}>
              <NavLink item={item} pathname={pathname} />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/** The Security link at the foot of the sidebar. */
export function SecurityLink() {
  const pathname = usePathname();
  return <NavLink item={{ href: "/security", label: "Security", icon: ShieldCheck, active: (p) => p.startsWith("/security") }} pathname={pathname} />;
}
