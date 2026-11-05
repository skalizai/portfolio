"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

const OUTLINE = "border border-line-strong";

/** Opens your email program with the address and subject filled in. You attach the files and send. */
export function mailtoLink(email: string, jobTitle: string, applicantName: string): string {
  const subject = applicantName ? `Application — ${jobTitle} — ${applicantName}` : `Application — ${jobTitle}`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

/** The address to apply to, from the listing or typed in by you when you've found one elsewhere. */
export function JobEmail({
  jobId,
  jobName,
  jobTitle,
  email,
  listingContext,
  applicantName,
  onSaved,
}: {
  jobId: string;
  jobName: string;
  jobTitle: string;
  email: string | null;
  listingContext: string | null;
  applicantName: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(email ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(next: string | null) {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/jobs/${jobId}/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: next }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      const body = await response.json();
      setDraft(body.applyEmail ?? "");
      setEditing(false);
      onSaved();
      return;
    }
    const body = await response?.json().catch(() => null);
    setError(body?.error ?? "Couldn't save that. Please try again.");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save(draft.trim());
  }

  if (editing) {
    return (
      <form onSubmit={submit}>
        <label className="block">
          Email to apply <span className="sr-only">for {jobName}</span>
          <input
            className="mt-1 w-full max-w-md rounded-md border border-line-strong bg-bg px-3 py-2 text-sm text-txt"
            type="email"
            required
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        {error && <p className="mt-1">{error}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            Save email <span className="sr-only">for {jobName}</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" className={OUTLINE} onClick={() => setEditing(false)}>
            Cancel <span className="sr-only">editing the email for {jobName}</span>
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1 basis-64">
        {email ? (
          <>
            <p className="break-words">
              <span className="text-dim">Email to apply: </span>
              <a className="font-semibold underline" href={mailtoLink(email, jobTitle, applicantName)}>
                {email}
              </a>
            </p>
            <p className="mt-1 break-words text-dim">{listingContext ? <>The listing says: &ldquo;{listingContext}&rdquo;</> : "You added this address."}</p>
          </>
        ) : (
          <p className="text-dim">No email to apply to in this listing. Apply through Open listing, or add one if you find it.</p>
        )}
        {error && <p className="mt-1">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" className={OUTLINE} onClick={() => setEditing(true)}>
          {email ? "Change email" : "Add email"} <span className="sr-only">for {jobName}</span>
        </Button>
        {email && !listingContext && (
          <Button type="button" variant="ghost" size="sm" className={OUTLINE} disabled={busy} onClick={() => save(null)}>
            Remove email <span className="sr-only">for {jobName}</span>
          </Button>
        )}
      </div>
    </div>
  );
}
