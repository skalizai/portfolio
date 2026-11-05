"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { SCREENING_LABELS, type ScreeningAnswers } from "@/lib/search/screening.labels";

const FIELD = "mt-1 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-sm text-txt";

export function ScreeningForm({ initial }: { initial: ScreeningAnswers }) {
  const [answers, setAnswers] = useState(initial);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("Saving…");
    const response = await fetch("/api/settings/screening", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answers),
    }).catch(() => null);
    if (response?.ok) {
      setMessage("Answers saved.");
      return;
    }
    const body = await response?.json().catch(() => null);
    setMessage(body?.error ?? "Couldn't save your answers. Please try again.");
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold">Screening answers</h2>
        <p className="mt-1 text-sm text-dim">Ready to copy into application forms. Only what you enter here is used.</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {(Object.keys(SCREENING_LABELS) as (keyof ScreeningAnswers)[]).map((key) => (
            <label key={key} className="block text-sm">
              {SCREENING_LABELS[key]}
              <input className={FIELD} value={answers[key]} onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))} />
            </label>
          ))}
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Save answers</Button>
        <p role="status" className="min-h-5 text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}
