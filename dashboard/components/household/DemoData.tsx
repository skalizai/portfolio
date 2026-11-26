"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Loads or clears the sample data. Clearing removes only what was loaded as demo. */
export function DemoData({ loaded }: { loaded: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(method: "POST" | "DELETE") {
    if (method === "DELETE" && !window.confirm("Clear the demo data? Only rows marked as demo are removed; your own records stay.")) return;
    setBusy(true);
    setMessage(method === "POST" ? "Loading…" : "Clearing…");
    const response = await fetch("/api/household/demo", { method }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setMessage(body?.error ?? "That didn't work. Please try again.");
      return;
    }
    setMessage(
      method === "POST"
        ? `Demo data loaded.${body?.skippedMonths?.length ? ` Payroll for ${body.skippedMonths.join(" and ")} was left out, because you already have payroll for it.` : ""}`
        : "Demo data cleared.",
    );
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {loaded ? (
        <Button type="button" variant="ghost" className="h-11 border border-line-strong" disabled={busy} onClick={() => run("DELETE")}>
          Clear demo data
        </Button>
      ) : (
        <Button type="button" className="h-11" disabled={busy} onClick={() => run("POST")}>
          Load demo data
        </Button>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
