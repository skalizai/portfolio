"use client";

import { ChevronDown, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { DASHBOARD_LINKS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Home, plus a Job Dashboard menu holding every section. */
export function MainNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapper = useRef<HTMLLIElement>(null);
  const inDashboard = DASHBOARD_LINKS.some(({ href }) => pathname.startsWith(href));
  const current = DASHBOARD_LINKS.find(({ href }) => pathname.startsWith(href));

  // Closes on a click elsewhere, on Escape, and after moving to another page.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => wrapper.current?.contains(event.target as Node) || setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      wrapper.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => setOpen(false), [pathname]);

  const item = "flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors";

  return (
    <nav aria-label="Main">
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={cn(item, pathname === "/" ? "bg-surface-2 text-txt" : "text-dim hover:text-txt")}>
            Home
          </Link>
        </li>
        <li>
          <Link
            href="/investments"
            aria-current={pathname.startsWith("/investments") ? "page" : undefined}
            className={cn(item, pathname.startsWith("/investments") ? "bg-surface-2 text-txt" : "text-dim hover:text-txt")}
          >
            Investments
          </Link>
        </li>
        <li ref={wrapper} className="relative">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((value) => !value)}
            className={cn(item, "border", inDashboard ? "border-line-strong bg-surface-2 text-txt" : "border-line text-dim hover:text-txt")}
          >
            <LayoutGrid aria-hidden className="size-4 text-brand" />
            Job Dashboard
            {current && <span className="hidden text-dim sm:inline">· {current.label}</span>}
            <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
          <ul
            id={menuId}
            hidden={!open}
            className="absolute left-0 z-20 mt-2 w-60 rounded-2xl border border-line bg-surface p-2 shadow-2xl shadow-black/30"
          >
            {DASHBOARD_LINKS.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm", active ? "bg-surface-2 text-txt" : "text-dim hover:bg-surface-2 hover:text-txt")}
                  >
                    <Icon aria-hidden className="size-4 text-brand" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      </ul>
    </nav>
  );
}
