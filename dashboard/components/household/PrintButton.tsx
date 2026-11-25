"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button type="button" className="h-11" onClick={() => window.print()}>
      <Printer aria-hidden className="size-4" /> Print
    </Button>
  );
}
