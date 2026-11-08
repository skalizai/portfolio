"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_SPONSORSHIP_TERM, type SponsorshipRule } from "@/lib/search/sponsorship";

const FIELD = "mt-1 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-sm text-txt";
const OUTLINE = "border border-line-strong";

/** Countries where you need something extra, such as visa sponsorship, and how strictly to apply it. */
export function SponsorshipForm({ initial }: { initial: SponsorshipRule[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (index: number, change: Partial<SponsorshipRule>) => setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...change } : rule)));

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("Saving…");
    const response = await fetch("/api/settings/sponsorship", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rules: rules.filter((rule) => rule.country.trim()) }),
    }).catch(() => null);
    setBusy(false);
    const body = await response?.json().catch(() => null);
    if (!response?.ok) {
      setMessage(body?.error ?? "Couldn't save these. Please try again.");
      return;
    }
    setRules(body.rules);
    const added: string[] = body.addedLocations;
    setMessage(added.length ? `Saved. ${added.join(", ")} ${added.length === 1 ? "was" : "were"} also added to your search locations.` : "Saved.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold">Countries that need visa sponsorship</h2>
        <p className="mt-1 text-sm text-dim">
          For each country, the search adds your phrase, such as &ldquo;{DEFAULT_SPONSORSHIP_TERM}&rdquo;. Tick the box to keep only jobs whose listing mentions it, which also saves
          scoring the others. A phrase about visas or sponsorship matches any mention of either. Any other phrase, such as &ldquo;Employment Pass&rdquo;, has to appear as written.
        </p>

        {rules.length ? (
          <ul className="mt-3 space-y-3">
            {rules.map((rule, index) => (
              <li key={index} className="grid gap-3 rounded-md border border-line p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <label className="block text-sm">
                  Country
                  <input className={FIELD} value={rule.country} required onChange={(e) => update(index, { country: e.target.value })} />
                </label>
                <label className="block text-sm">
                  Search phrase <span className="sr-only">for {rule.country || "this country"}</span>
                  <input className={FIELD} value={rule.term} placeholder={DEFAULT_SPONSORSHIP_TERM} onChange={(e) => update(index, { term: e.target.value })} />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={rule.onlyIfMentioned} onChange={(e) => update(index, { onlyIfMentioned: e.target.checked })} />
                    Only show jobs that mention it <span className="sr-only">in {rule.country || "this country"}</span>
                  </label>
                  <Button type="button" variant="ghost" size="sm" className={OUTLINE} onClick={() => setRules((current) => current.filter((_, i) => i !== index))}>
                    Remove <span className="sr-only">{rule.country || "this country"}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-dim">No countries yet. Jobs everywhere are searched and shown as usual.</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="ghost" className={OUTLINE} onClick={() => setRules((current) => [...current, { country: "", term: DEFAULT_SPONSORSHIP_TERM, onlyIfMentioned: true }])}>
            Add a country
          </Button>
          <Button type="submit" disabled={busy}>
            Save countries
          </Button>
        </div>
        <p role="status" className="mt-2 min-h-5 text-sm">
          {message}
        </p>
      </section>
    </form>
  );
}
