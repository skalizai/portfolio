"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApplyDrawer } from "@/components/ApplyDrawer";
import { Button } from "@/components/ui/button";
import type { PrepareResult } from "@/lib/apply/prepare";
import type { FetchReport } from "@/lib/jobs/fetchJobs";
import type { JobRow } from "@/lib/jobs/overview";
import type { ScoreReport } from "@/lib/matching/scoreJobs";
import type { ScreeningAnswers } from "@/lib/search/screening.labels";

const CHANNELS: Record<JobRow["applyChannel"], string> = {
  EMAIL: "Apply by email",
  ATS_FORM: "Application form",
  LINKEDIN_EASY_APPLY: "LinkedIn",
  COMPANY_SITE: "Company or job site",
  UNKNOWN: "Check the listing",
};

const VERDICTS: Record<NonNullable<JobRow["match"]>["verdict"], string> = {
  STRONG: "Strong match",
  GOOD: "Good match",
  WEAK: "Weak match",
  REJECT: "Not a match",
};

const FIELD = "w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-sm text-txt";
const OUTLINE = "border border-line-strong";
const CONCURRENT_DRAFTS = 3;

// A fixed locale and time zone, so the server and browser render the same text.
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });

function searchMessage(report: FetchReport): string {
  const sources = Object.values(report.sources);
  const error = sources.flatMap((source) => source.errors)[0];
  if (error) return error;
  if (!sources.length) return "No job source is set up.";
  if (sources.every((source) => source.requests === 0)) return "Today's search allowance is used up.";
  return report.inserted ? `Found ${report.inserted} new ${report.inserted === 1 ? "job" : "jobs"}.` : "No new jobs.";
}

function scoreMessage(report: ScoreReport): string {
  const parts = [`Scored ${report.scored} ${report.scored === 1 ? "job" : "jobs"}.`];
  if (report.capReached) parts.push("Today's scoring limit is reached, so the rest will wait until tomorrow.");
  return [...parts, ...report.errors].join(" ");
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-dim">{label}</p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {items.map((item) => (
          <li key={item} className="max-w-full rounded-md border border-line-strong px-2 py-0.5 break-words">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusLabel(job: JobRow): string | null {
  if (job.application?.submitted) return "Applied";
  if (job.application) return "Draft ready";
  return job.state === "SAVED" ? "Saved for later" : null;
}

function JobCard({
  job,
  selected,
  busy,
  onToggle,
  onPrepare,
  onOpen,
  onState,
}: {
  job: JobRow;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onPrepare: () => void;
  onOpen: (applicationId: string) => void;
  onState: (state: "ACTIVE" | "SAVED" | "DISMISSED") => void;
}) {
  const { match, application } = job;
  const status = statusLabel(job);
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-64 gap-3">
          {!application && (
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={selected}
              onChange={onToggle}
              aria-label={`Select ${job.title} at ${job.company}`}
            />
          )}
          <div className="min-w-0">
            <h3 className="font-semibold break-words">{job.title}</h3>
            <p className="mt-1 text-sm break-words">
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
            </p>
            <p className="mt-1 text-sm text-dim">
              {[
                status,
                CHANNELS[job.applyChannel],
                job.workMode,
                job.employmentType,
                job.publisher && `via ${job.publisher}`,
                job.postedAt && `posted ${dateFormat.format(new Date(job.postedAt))}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        {match && (
          <p className="text-right text-sm">
            <span className="block font-mono text-xl font-semibold">{match.score}</span>
            <span className="text-dim">{VERDICTS[match.verdict]}</span>
          </p>
        )}
      </div>

      {match && (
        <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm">
          <p className="break-words">{match.reasoning}</p>
          <Chips label="You have" items={match.matchedSkills} />
          <Chips label="Missing" items={match.missingSkills} />
          {match.redFlags.length > 0 && (
            <div>
              <p className="text-dim">Watch out</p>
              <ul className="mt-1 list-disc pl-5">
                {match.redFlags.map((flag) => (
                  <li key={flag} className="break-words">
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {application ? (
          <Button type="button" size="sm" onClick={() => onOpen(application.id)}>
            {application.submitted ? "View application" : "Review draft"} <span className="sr-only">for {job.title} at {job.company}</span>
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={busy} onClick={onPrepare}>
            Prepare draft <span className="sr-only">for {job.title} at {job.company}</span>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className={OUTLINE}>
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            Open listing <span className="sr-only">for {job.title} at {job.company}, opens in a new tab</span>
          </a>
        </Button>
        {!application && (
          <>
            <Button type="button" variant="ghost" size="sm" className={OUTLINE} onClick={() => onState(job.state === "SAVED" ? "ACTIVE" : "SAVED")}>
              {job.state === "SAVED" ? "Unsave" : "Save for later"} <span className="sr-only">{job.title} at {job.company}</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" className={OUTLINE} onClick={() => onState("DISMISSED")}>
              Dismiss <span className="sr-only">{job.title} at {job.company}</span>
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

export function JobsBoard({
  matches,
  sponsorshipUnknown,
  below,
  waiting,
  minScore,
  screening,
}: {
  matches: JobRow[];
  sponsorshipUnknown: JobRow[];
  below: JobRow[];
  waiting: JobRow[];
  minScore: number;
  screening: ScreeningAnswers;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("");
  const [source, setSource] = useState("");
  const [sort, setSort] = useState<"score" | "newest">("score");
  const [refreshing, setRefreshing] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [message, setMessage] = useState("");

  const allJobs = [...matches, ...sponsorshipUnknown, ...below, ...waiting];
  const sources = [...new Set(allJobs.map((job) => job.publisher).filter((name): name is string => Boolean(name)))].sort();
  const needle = query.trim().toLowerCase();

  const visible = (jobs: JobRow[]) =>
    jobs
      .filter(
        (job) =>
          (!channel || job.applyChannel === channel) &&
          (!source || job.publisher === source) &&
          (!needle || [job.title, job.company, job.location].some((text) => text?.toLowerCase().includes(needle))),
      )
      .sort((a, b) =>
        sort === "score"
          ? (b.match?.score ?? -1) - (a.match?.score ?? -1)
          : new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime(),
      );

  async function post<T>(path: string, body?: unknown): Promise<T | null> {
    const response = await fetch(path, {
      method: "POST",
      ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    }).catch(() => null);
    return response?.ok ? ((await response.json()) as T) : null;
  }

  async function refresh() {
    setRefreshing(true);
    setMessage("Searching for jobs…");
    const search = await post<FetchReport>("/api/jobs/fetch");
    const found = search ? searchMessage(search) : "The search didn't finish.";

    setMessage(`${found} Scoring…`);
    const score = await post<ScoreReport>("/api/jobs/score");
    setMessage(`${found} ${score ? scoreMessage(score) : "Scoring didn't finish, so please try again."}`);
    setRefreshing(false);
    router.refresh();
  }

  async function prepare(jobIds: string[]) {
    setPreparing(true);
    setMessage(`Preparing ${jobIds.length === 1 ? "your draft" : `${jobIds.length} drafts`}. This can take a minute or two…`);

    const results: PrepareResult[] = [];
    const remaining = [...jobIds];
    await Promise.all(
      Array.from({ length: CONCURRENT_DRAFTS }, async () => {
        for (let jobId = remaining.shift(); jobId; jobId = remaining.shift()) {
          const response = await post<{ results: PrepareResult[] }>("/api/applications", { jobIds: [jobId] });
          results.push(...(response?.results ?? [{ jobId, status: "failed", message: "Couldn't prepare this draft. Please try again." }]));
        }
      }),
    );

    const ready = results.flatMap((result) => ("applicationId" in result ? [result.applicationId] : []));
    const problems = [...new Set(results.flatMap((result) => ("message" in result ? [result.message] : [])))];
    setMessage(problems.join(" ") || "");
    setPreparing(false);
    setSelected(new Set());
    router.refresh();
    if (ready.length) {
      setQueue(ready);
      setQueueIndex(0);
    }
  }

  async function setJobState(job: JobRow, state: "ACTIVE" | "SAVED" | "DISMISSED") {
    const done = await post(`/api/jobs/${job.id}/state`, { state });
    setMessage(done ? "" : "Couldn't update that job. Please try again.");
    setSelected((current) => {
      const next = new Set(current);
      next.delete(job.id);
      return next;
    });
    router.refresh();
  }

  const list = (jobs: JobRow[]) => (
    <ul className="mt-3 grid gap-3">
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          busy={preparing}
          selected={selected.has(job.id)}
          onToggle={() =>
            setSelected((current) => {
              const next = new Set(current);
              if (next.has(job.id)) next.delete(job.id);
              else next.add(job.id);
              return next;
            })
          }
          onPrepare={() => prepare([job.id])}
          onOpen={(applicationId) => {
            setQueue([applicationId]);
            setQueueIndex(0);
          }}
          onState={(state) => setJobState(job, state)}
        />
      ))}
    </ul>
  );

  const collapsed = (title: string, jobs: JobRow[], note?: string) =>
    jobs.length > 0 && (
      <details className="mt-4 rounded-xl border border-line p-4">
        <summary className="cursor-pointer font-semibold">
          {title} ({jobs.length})
        </summary>
        {note && <p className="mt-2 text-sm text-dim">{note}</p>}
        {list(jobs)}
      </details>
    );

  const shownMatches = visible(matches);

  return (
    <section aria-label="Jobs" className="mt-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-sm">
          Search title, company or place
          <input className={`mt-1 ${FIELD}`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="min-w-40 flex-1 text-sm sm:flex-none">
          How to apply
          <select className={`mt-1 ${FIELD}`} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">All</option>
            {Object.entries(CHANNELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-40 flex-1 text-sm sm:flex-none">
          Source
          <select className={`mt-1 ${FIELD}`} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All</option>
            {sources.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-32 flex-1 text-sm sm:flex-none">
          Sort by
          <select className={`mt-1 ${FIELD}`} value={sort} onChange={(e) => setSort(e.target.value as "score" | "newest")}>
            <option value="score">Best score</option>
            <option value="newest">Newest</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={!selected.size || preparing} onClick={() => prepare([...selected])}>
          Prepare drafts for selected ({selected.size})
        </Button>
        <Button type="button" variant="ghost" className={OUTLINE} onClick={refresh} disabled={refreshing}>
          Refresh now
        </Button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm">
        {message}
      </p>

      <h2 className="mt-2 text-lg font-semibold">Your matches</h2>
      {shownMatches.length ? (
        list(shownMatches)
      ) : (
        <p className="mt-3 rounded-xl border border-line bg-surface p-4 text-dim">
          {matches.length ? "No matches fit these filters." : `No jobs have scored ${minScore} or more yet.`}
        </p>
      )}

      {collapsed(
        "Sponsorship not mentioned",
        visible(sponsorshipUnknown),
        "These are in countries where you need visa sponsorship, but the listing doesn't say either way. Many employers only discuss it once you've applied, so you may want to ask.",
      )}
      {collapsed("Below your minimum score", visible(below))}
      {collapsed("Waiting to be scored", visible(waiting))}

      {queue[queueIndex] && (
        <ApplyDrawer
          key={queue[queueIndex]}
          applicationId={queue[queueIndex]}
          screening={screening}
          position={queue.length > 1 ? { current: queueIndex + 1, total: queue.length } : undefined}
          onNext={
            queue.length > 1
              ? () => {
                  if (queueIndex + 1 < queue.length) setQueueIndex(queueIndex + 1);
                  else {
                    setQueue([]);
                    router.refresh();
                  }
                }
              : undefined
          }
          onClose={() => {
            setQueue([]);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
