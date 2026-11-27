"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** A two-way Light / Dark switch for the sidebar. */
export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known in the browser, so the server renders Dark as chosen.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const theme = mounted ? resolvedTheme : "dark";
  const option = (value: "light" | "dark", label: string, Icon: typeof Sun) => (
    <button
      type="button"
      aria-pressed={theme === value}
      onClick={() => setTheme(value)}
      className={cn(
        "flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl text-sm transition-colors",
        theme === value ? "bg-surface-2 font-medium text-txt shadow-sm" : "text-dim hover:text-txt",
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Colour theme" className="flex gap-1 rounded-2xl border border-line bg-bg/60 p-1">
      {option("light", "Light", Sun)}
      {option("dark", "Dark", Moon)}
    </div>
  );
}
