"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Asks first, then sends DELETE to `path`. Goes to `then` afterwards, or refreshes the page. */
export function RemoveButton({ path, label, question, then, verb = "Remove" }: { path: string; label: string; question?: string; then?: string; verb?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="border border-line-strong"
        onClick={async () => {
          if (!window.confirm(question ?? `${verb} ${label}?`)) return;
          const response = await fetch(path, { method: "DELETE" }).catch(() => null);
          if (!response?.ok) {
            const body = await response?.json().catch(() => null);
            setMessage(body?.error ?? `Couldn't ${verb.toLowerCase()} that. Please try again.`);
            return;
          }
          if (then) {
            router.push(then);
            router.refresh();
          }
          else router.refresh();
        }}
      >
        <Trash2 aria-hidden className="size-4" /> {verb} <span className="sr-only">{label}</span>
      </Button>
      {message && (
        <p role="status" className="mt-1 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
