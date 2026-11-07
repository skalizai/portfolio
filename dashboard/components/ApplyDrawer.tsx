"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TailoredCv } from "@/lib/apply/cvSchema";
import { SCREENING_LABELS, type ScreeningAnswers } from "@/lib/search/screening.labels";

type Application = {
  id: string;
  status: string;
  channel: string;
  coverLetter: string | null;
  tailoredCv: TailoredCv | null;
  draftWarnings: string[];
  submittedAt: string | null;
  applyEmailContext: string | null;
  job: { title: string; company: string; url: string; applyUrl: string | null; applyEmail: string | null };
};

const FIELD = "mt-1 w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-sm text-txt";
const OUTLINE = "border border-line-strong";

const toLines = (items: string[]) => items.join("\n");
const fromLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function CopyButton({ label, text, onCopied }: { label: string; text: string; onCopied: (message: string) => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={OUTLINE}
      disabled={!text}
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => onCopied(`${label} copied.`),
          () => onCopied("Your browser blocked copying, so please select the text instead."),
        )
      }
    >
      Copy {label.toLowerCase()}
    </Button>
  );
}

/** Your review step. Everything is editable, and only your own click records an application. */
export function ApplyDrawer({
  applicationId,
  screening,
  position,
  onNext,
  onClose,
}: {
  applicationId: string;
  screening: ScreeningAnswers;
  position?: { current: number; total: number };
  onNext?: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [application, setApplication] = useState<Application | null>(null);
  const [letter, setLetter] = useState("");
  const [cv, setCv] = useState<TailoredCv | null>(null);
  const [message, setMessage] = useState("Loading the draft…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  useEffect(() => {
    let current = true;
    fetch(`/api/applications/${applicationId}`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((data: Application) => {
        if (!current) return;
        setApplication(data);
        setLetter(data.coverLetter ?? "");
        setCv(data.tailoredCv);
        setMessage("");
      })
      .catch(() => current && setMessage("Couldn't load this draft. Please try again."));
    return () => {
      current = false;
    };
  }, [applicationId]);

  const submitted = Boolean(application?.submittedAt);
  const locked = submitted;

  async function save(): Promise<boolean> {
    if (locked) return true;
    setBusy(true);
    setMessage("Saving…");
    const response = await fetch(`/api/applications/${applicationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ coverLetter: letter, ...(cv ? { tailoredCv: cv } : {}) }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      setMessage("Draft saved.");
      return true;
    }
    const body = await response?.json().catch(() => null);
    setMessage(body?.error ?? "Couldn't save the draft. Please try again.");
    return false;
  }

  async function downloadCv() {
    if (!(await save())) return;
    window.location.assign(`/api/applications/${applicationId}/cv`);
  }

  async function downloadLetter() {
    if (!(await save())) return;
    window.location.assign(`/api/applications/${applicationId}/letter`);
  }

  async function markApplied() {
    if (!(await save())) return;
    setBusy(true);
    const response = await fetch(`/api/applications/${applicationId}/mark-submitted`, { method: "POST" }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      setApplication((a) => (a ? { ...a, status: "SUBMITTED", submittedAt: new Date().toISOString() } : a));
      setMessage("Marked as applied. The dashboard keeps a copy of this version.");
      return;
    }
    const body = await response?.json().catch(() => null);
    setMessage(body?.error ?? "Couldn't update this application. Please try again.");
  }

  const setRoleBullets = (index: number, value: string) =>
    setCv((c) => (c ? { ...c, experience: c.experience.map((role, i) => (i === index ? { ...role, bullets: fromLines(value) } : role)) } : c));

  const screeningText = (Object.keys(SCREENING_LABELS) as (keyof ScreeningAnswers)[]).filter((key) => screening[key]);
  const applyLink = application?.job.applyUrl ?? application?.job.url;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="draft-title"
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-2xl overflow-y-auto border-l border-line bg-bg p-4 text-txt backdrop:bg-black/60"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="draft-title" className="text-lg font-semibold break-words">
            {application ? `${application.job.title} at ${application.job.company}` : "Application draft"}
          </h2>
          {position && (
            <p className="text-sm text-dim">
              Draft {position.current} of {position.total}
            </p>
          )}
        </div>
        <Button type="button" variant="ghost" size="sm" className={OUTLINE} onClick={() => dialog.current?.close()}>
          Close
        </Button>
      </div>

      <p role="status" className="mt-2 min-h-5 text-sm">
        {message}
      </p>

      {application && (
        <div className="mt-2 space-y-4">
          {application.draftWarnings.length > 0 && (
            <div className="rounded-xl border border-line-strong bg-surface p-3 text-sm">
              <h3 className="font-semibold">Please check before using this</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {application.draftWarnings.map((warning) => (
                  <li key={warning} className="break-words">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="block text-sm font-semibold">
            Cover letter
            <textarea className={`${FIELD} font-normal`} rows={14} value={letter} readOnly={locked} onChange={(e) => setLetter(e.target.value)} />
          </label>

          {cv && (
            <section className="rounded-xl border border-line bg-surface p-3">
              <h3 className="font-semibold">Tailored CV</h3>
              <p className="mt-1 text-sm text-dim">Your CV&apos;s own content, with the most relevant items first.</p>
              <div className="mt-3 space-y-3">
                <label className="block text-sm">
                  Headline
                  <input className={FIELD} value={cv.headline} readOnly={locked} onChange={(e) => setCv({ ...cv, headline: e.target.value })} />
                </label>
                <label className="block text-sm">
                  Summary
                  <textarea className={FIELD} rows={5} value={cv.summary} readOnly={locked} onChange={(e) => setCv({ ...cv, summary: e.target.value })} />
                </label>
                <label className="block text-sm">
                  Competencies <span className="text-dim">(one per line)</span>
                  <textarea
                    className={FIELD}
                    rows={6}
                    defaultValue={toLines(cv.competencies)}
                    readOnly={locked}
                    onChange={(e) => setCv({ ...cv, competencies: fromLines(e.target.value) })}
                  />
                </label>
                {cv.experience.map((role, index) => (
                  <label key={`${role.company}-${index}`} className="block text-sm">
                    <span className="break-words">
                      {role.role}, {role.company}
                    </span>{" "}
                    <span className="text-dim">(one per line)</span>
                    <textarea className={FIELD} rows={4} defaultValue={toLines(role.bullets)} readOnly={locked} onChange={(e) => setRoleBullets(index, e.target.value)} />
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-line bg-surface p-3 text-sm">
            <h3 className="font-semibold">Screening answers</h3>
            {screeningText.length ? (
              <dl className="mt-2 space-y-2">
                {screeningText.map((key) => (
                  <div key={key} className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <dt className="text-dim">{SCREENING_LABELS[key]}</dt>
                      <dd className="break-words">{screening[key]}</dd>
                    </div>
                    <CopyButton label={SCREENING_LABELS[key]} text={screening[key]} onCopied={setMessage} />
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-1 text-dim">None saved yet. Add them in Settings.</p>
            )}
          </section>

          <section className="rounded-xl border border-line bg-surface p-3 text-sm">
            <h3 className="font-semibold">Apply</h3>
            {application.channel === "LINKEDIN_EASY_APPLY" && (
              <p className="mt-1 text-dim">Open the job on LinkedIn, copy what you need from here and submit it yourself. This dashboard never acts on LinkedIn for you.</p>
            )}
            {application.job.applyEmail ? (
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words">
                  <span className="text-dim">Email to apply: </span>
                  <strong>{application.job.applyEmail}</strong>
                </p>
                <CopyButton label="Email address" text={application.job.applyEmail} onCopied={setMessage} />
              </div>
            ) : (
              <p className="mt-1 text-dim">No email to apply to in this listing. Use the application page below.</p>
            )}
            {application.applyEmailContext && (
              <p className="mt-1 break-words">
                <span className="text-dim">The listing says: </span>&ldquo;{application.applyEmailContext}&rdquo;
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {applyLink && (
                <Button asChild variant="ghost" size="sm" className={OUTLINE}>
                  <a href={applyLink} target="_blank" rel="noopener noreferrer">
                    Open application page <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
              )}
              <CopyButton label="Cover letter" text={letter} onCopied={setMessage} />
              <Button type="button" variant="ghost" size="sm" className={OUTLINE} disabled={busy || !letter.trim()} onClick={downloadLetter}>
                Download cover letter as PDF
              </Button>
              {cv && (
                <Button type="button" variant="ghost" size="sm" className={OUTLINE} disabled={busy} onClick={downloadCv}>
                  Download CV as PDF
                </Button>
              )}
            </div>
          </section>

          <div className="flex flex-wrap gap-2 pb-4">
            {!locked && (
              <Button type="button" variant="ghost" className={OUTLINE} disabled={busy} onClick={save}>
                Save draft
              </Button>
            )}
            {!locked && (
              <Button type="button" variant="ghost" className={OUTLINE} disabled={busy} onClick={markApplied}>
                Mark as applied
              </Button>
            )}
            {onNext && (
              <Button type="button" variant="ghost" className={OUTLINE} disabled={busy} onClick={onNext}>
                {position && position.current < position.total ? "Next draft" : "Finish"}
              </Button>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
