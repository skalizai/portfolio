"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label="Switch between light and dark mode"
      onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
    >
      {/* Both icons render and CSS picks one, so server and client markup always match. */}
      <Sun aria-hidden className="size-4 [[data-theme=light]_&]:hidden" />
      <Moon aria-hidden className="hidden size-4 [[data-theme=light]_&]:block" />
    </Button>
  );
}
