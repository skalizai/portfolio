"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CV_FILE_TYPES, readCv } from "@/lib/cv/readCv";
import { applyChanges, type Change } from "@/lib/profile/diff";
import type { Profile } from "@/lib/profile/schema";

const FIELD = "mt-1 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-sm text-txt";
const MAX_CV_BYTES = 25 * 1024 * 1024;

type Status = { kind: "idle" | "working" | "saved" | "error"; message?: string };
type Review = { proposed: Profile; changes: Change[]; selected: Set<string>; cvText: string };

const toLines = (items: string[]) => items.join("\n");
const fromLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function Text({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="block text-sm">
      {label}
      <input className={FIELD} type={type} min={type === "number" ? 0 : undefined} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Keeps its own text so that typing a new line isn't stripped out mid-edit. */
function Lines({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) {
  const [draft, setDraft] = useState(toLines(value));
  const [synced, setSynced] = useState(value);
  if (value !== synced && toLines(value) !== toLines(fromLines(draft))) {
    setSynced(value);
    setDraft(toLines(value));
  }

  return (
    <label className="block text-sm">
      {label} <span className="text-dim">(one per line)</span>
      <textarea
        className={FIELD}
        rows={Math.min(Math.max(value.length + 1, 3), 10)}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(fromLines(e.target.value));
        }}
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function changeSummary(change: Change): ReactNode {
  if (change.kind === "field") {
    return (
      <>
        <s className="text-dim">{change.before || "(empty)"}</s> → {change.after}
      </>
    );
  }
  return `${change.kind === "list-add" ? "Add" : "Remove"}: ${change.items.join(", ")}`;
}

export function ProfileEditor({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [review, setReview] = useState<Review | null>(null);

  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));
  const setContact = (patch: Partial<Profile["contact"]>) => setProfile((p) => ({ ...p, contact: { ...p.contact, ...patch } }));
  const setPrefs = (patch: Partial<Profile["preferences"]>) =>
    setProfile((p) => ({ ...p, preferences: { ...p.preferences, ...patch } }));

  async function save(next: Profile, cvText?: string) {
    setStatus({ kind: "working", message: "Saving…" });
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: next, cvText }),
    }).catch(() => null);

    if (response?.ok) {
      setStatus({ kind: "saved", message: "Profile saved." });
      return true;
    }
    const body = await response?.json().catch(() => null);
    setStatus({ kind: "error", message: body?.error ?? "Couldn't save the profile. Please try again." });
    return false;
  }

  async function onCvSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_CV_BYTES) {
      setStatus({ kind: "error", message: "That file is over 25 MB." });
      return;
    }

    setReview(null);
    setStatus({ kind: "working", message: "Reading your CV…" });
    const result = await readCv(file);
    if ("error" in result) {
      setStatus({ kind: "error", message: result.error });
      return;
    }
    const cvText = result.text;

    setStatus({ kind: "working", message: "Comparing it with your profile. This can take a minute…" });
    const response = await fetch("/api/profile/cv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: cvText }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);

    if (!response?.ok) {
      setStatus({ kind: "error", message: body?.error ?? "Couldn't process that CV. Please try again." });
      return;
    }

    const changes: Change[] = body.changes;
    const selected = new Set(changes.filter((c) => c.recommended).map((c) => c.id));
    setReview({ proposed: body.proposed, changes, selected, cvText });
    setStatus({ kind: "idle" });
  }

  function toggle(id: string) {
    setReview((r) => {
      if (!r) return r;
      const selected = new Set(r.selected);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { ...r, selected };
    });
  }

  async function applyReview() {
    if (!review) return;
    const next = applyChanges(profile, review.proposed, review.changes, review.selected);
    if (await save(next, review.cvText)) {
      setProfile(next);
      setReview(null);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold">Update from a new CV</h2>
        <p className="mt-1 text-sm text-dim">You&apos;ll review every change before anything is saved. Your target titles and preferences won&apos;t change.</p>
        <label className="mt-3 block text-sm">
          CV (PDF or Word)
          <input className={FIELD} type="file" accept={CV_FILE_TYPES} onChange={onCvSelected} disabled={status.kind === "working"} />
        </label>

        {review && (
          <div className="mt-4">
            <h3 className="font-semibold">Review changes</h3>
            {review.changes.length === 0 ? (
              <p className="mt-2 text-sm text-dim">This CV doesn&apos;t change anything in your profile.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {review.changes.map((change) => (
                  <li key={change.id}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" className="mt-1" checked={review.selected.has(change.id)} onChange={() => toggle(change.id)} />
                      <span className="min-w-0 break-words">
                        <strong>{change.label}.</strong> {changeSummary(change)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" onClick={applyReview} disabled={status.kind === "working"}>
                Apply selected changes
              </Button>
              <Button type="button" variant="ghost" onClick={() => setReview(null)}>
                Discard
              </Button>
            </div>
          </div>
        )}
      </section>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void save(profile);
        }}
      >
        <Section title="About you">
          <Text label="Name" value={profile.name} onChange={(name) => set({ name })} />
          <Text label="Headline" value={profile.headline} onChange={(headline) => set({ headline })} />
          <Text label="Location" value={profile.location} onChange={(location) => set({ location })} />
          <Text
            label="Years of experience"
            type="number"
            value={profile.yearsExperience}
            onChange={(v) => set({ yearsExperience: Math.max(0, Math.trunc(Number(v)) || 0) })}
          />
          <Text label="Current role" value={profile.currentRole} onChange={(currentRole) => set({ currentRole })} />
          <Text label="Leadership" value={profile.leadership} onChange={(leadership) => set({ leadership })} />
        </Section>

        <Section title="Contact details">
          <Text label="Email" value={profile.contact.email} onChange={(email) => setContact({ email })} />
          <Text label="Phone" value={profile.contact.phone} onChange={(phone) => setContact({ phone })} />
          <Text label="LinkedIn URL" value={profile.contact.linkedinUrl} onChange={(linkedinUrl) => setContact({ linkedinUrl })} />
          <Text label="Portfolio URL" value={profile.contact.portfolioUrl} onChange={(portfolioUrl) => setContact({ portfolioUrl })} />
        </Section>

        <Section title="Experience">
          <Lines label="Core skills" value={profile.coreSkills} onChange={(coreSkills) => set({ coreSkills })} />
          <Lines label="Modules" value={profile.modules} onChange={(modules) => set({ modules })} />
          <Lines label="Industries" value={profile.industries} onChange={(industries) => set({ industries })} />
          <Lines label="Certifications" value={profile.certifications} onChange={(certifications) => set({ certifications })} />
        </Section>

        <Section title="What you're looking for">
          <Lines label="Target job titles" value={profile.targetTitles} onChange={(targetTitles) => set({ targetTitles })} />
          <Lines label="Locations" value={profile.preferences.locations} onChange={(locations) => setPrefs({ locations })} />
          <Lines label="Work modes" value={profile.preferences.workModes} onChange={(workModes) => setPrefs({ workModes })} />
          <Lines label="Employment types" value={profile.preferences.employmentTypes} onChange={(employmentTypes) => setPrefs({ employmentTypes })} />
          <Lines label="Exclude jobs mentioning" value={profile.preferences.excludeKeywords} onChange={(excludeKeywords) => setPrefs({ excludeKeywords })} />
          <div className="space-y-4">
            <Text label="Minimum seniority" value={profile.preferences.minSeniority} onChange={(minSeniority) => setPrefs({ minSeniority })} />
            <Text
              label="Minimum salary (AED, optional)"
              type="number"
              value={profile.preferences.salaryFloorAED ?? ""}
              onChange={(v) => setPrefs({ salaryFloorAED: v === "" ? null : Math.max(0, Math.trunc(Number(v)) || 0) })}
            />
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={status.kind === "working"}>
            Save profile
          </Button>
        </div>
      </form>

      <p role="status" className="min-h-5 text-sm">
        {status.message}
      </p>
    </div>
  );
}
