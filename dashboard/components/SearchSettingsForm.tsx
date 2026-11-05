"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { buildQueries, searchCycleDays } from "@/lib/sources/jsearch";

const FIELD = "mt-1 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-sm text-txt";

/** Matches what the server saves: trimmed, with repeats dropped regardless of case. */
const fromLines = (value: string) => {
  const seen = new Set<string>();
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      const key = line.toLowerCase();
      if (!line || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export function SearchSettingsForm({
  initial,
  requestsPerDay,
}: {
  initial: { keywords: string[]; locations: string[]; minScore: number; scoreDailyCap: number };
  requestsPerDay: number;
}) {
  const [keywords, setKeywords] = useState(initial.keywords.join("\n"));
  const [locations, setLocations] = useState(initial.locations.join("\n"));
  const [minScore, setMinScore] = useState(String(initial.minScore));
  const [scoreDailyCap, setScoreDailyCap] = useState(String(initial.scoreDailyCap));
  const [message, setMessage] = useState("");

  const searches = buildQueries(fromLines(keywords), fromLines(locations)).length;
  const days = searchCycleDays(searches, requestsPerDay);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("Saving…");
    const response = await fetch("/api/settings/search", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        keywords: fromLines(keywords),
        locations: fromLines(locations),
        // An empty box becomes null, which the server rejects with a clear message.
        minScore: minScore.trim() ? Number(minScore) : null,
        scoreDailyCap: scoreDailyCap.trim() ? Number(scoreDailyCap) : null,
      }),
    }).catch(() => null);

    if (response?.ok) {
      setMessage("Settings saved.");
      return;
    }
    const body = await response?.json().catch(() => null);
    setMessage(body?.error ?? "Couldn't save the settings. Please try again.");
  }

  return (
    <form onSubmit={save} className="mt-6 space-y-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold">Job search</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Keywords <span className="text-dim">(one per line)</span>
            <textarea className={FIELD} rows={8} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
          </label>
          <label className="block text-sm">
            Countries and cities <span className="text-dim">(one per line)</span>
            <textarea className={FIELD} rows={8} value={locations} onChange={(e) => setLocations(e.target.value)} />
          </label>
        </div>
        <p className="mt-3 text-sm text-dim">
          {searches === 0
            ? "Add at least one keyword and one country."
            : `That makes ${searches} ${searches === 1 ? "search" : "searches"}. The search runs every morning at 7:00 Gulf time, so each one comes round about every ${days} ${days === 1 ? "day" : "days"}.`}
        </p>
        <p className="mt-1 text-sm text-dim">Short keywords find more. Long, very specific phrases often find nothing.</p>
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold">Scoring</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Minimum score to show as a match
            <input className={FIELD} type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(e.target.value)} />
          </label>
          <label className="block text-sm">
            Most jobs Claude may score per day
            <input className={FIELD} type="number" min={0} max={500} value={scoreDailyCap} onChange={(e) => setScoreDailyCap(e.target.value)} />
          </label>
        </div>
        <p className="mt-3 text-sm text-dim">The daily limit controls what scoring can spend. Anything over it waits until the next day.</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">Save settings</Button>
        <p role="status" className="min-h-5 text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}
