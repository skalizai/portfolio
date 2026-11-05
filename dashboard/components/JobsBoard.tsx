"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { FetchReport } from "@/lib/jobs/fetchJobs";
import type { JobRow } from "@/lib/jobs/overview";
import type { ScoreReport } from "@/lib/matching/scoreJobs";

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

function JobCard({ job }: { job: JobRow }) {
  const { match } = job;
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h3 className="font-semibold break-words">{job.title}</h3>
          <p className="mt-1 text-sm break-words">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </p>
          <p className="mt-1 text-sm text-dim">
            {[
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
        <div className="flex items-center gap-3">
          {match && (
            <p className="text-right text-sm">
              <span className="block text-xl font-semibold">{match.score}</span>
              <span className="text-dim">{VERDICTS[match.verdict]}</span>
            </p>
          )}
          <Button asChild variant="ghost" size="sm" className="border border-line-strong">
            <a href={job.url} target="_blank" rel="noopener noreferrer">
              Open listing <span className="sr-only">for {job.title} at {job.company}, opens in a new tab</span>
            </a>
          </Button>
        </div>
      </div>

      {match && (
        <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <p className="break-words">{match.reasoning}</p>
          {match.matchedSkills.length > 0 && (
            <p className="break-words">
              <span className="text-dim">You have: </span>
              {match.matchedSkills.join(", ")}
            </p>
          )}
          {match.missingSkills.length > 0 && (
            <p className="break-words">
              <span className="text-dim">Missing: </span>
              {match.missingSkills.join(", ")}
            </p>
          )}
          {match.redFlags.length > 0 && (
            <p className="break-words">
              <span className="text-dim">Watch out: </span>
              {match.redFlags.join(" ")}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function JobList({ jobs }: { jobs: JobRow[] }) {
  return (
    <ul className="mt-3 grid gap-3">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </ul>
  );
}

function Collapsed({ title, jobs }: { title: string; jobs: JobRow[] }) {
  if (!jobs.length) return null;
  return (
    <details className="mt-4 rounded-xl border border-line p-4">
      <summary className="cursor-pointer font-semibold">
        {title} ({jobs.length})
      </summary>
      <JobList jobs={jobs} />
    </details>
  );
}

export function JobsBoard({ matches, below, waiting, minScore }: { matches: JobRow[]; below: JobRow[]; waiting: JobRow[]; minScore: number }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  const needle = query.trim().toLowerCase();
  const visible = (jobs: JobRow[]) =>
    jobs.filter(
      (job) =>
        (!channel || job.applyChannel === channel) &&
        (!needle || [job.title, job.company, job.location].some((text) => text?.toLowerCase().includes(needle))),
    );

  async function post<T>(path: string): Promise<T | null> {
    const response = await fetch(path, { method: "POST" }).catch(() => null);
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

  const shownMatches = visible(matches);

  return (
    <section aria-label="Jobs" className="mt-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-sm">
          Search title, company or place
          <input className={`mt-1 ${FIELD}`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="min-w-48 text-sm">
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
        <Button type="button" onClick={refresh} disabled={refreshing}>
          Refresh now
        </Button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm">
        {message}
      </p>

      <h2 className="mt-2 text-lg font-semibold">Your matches</h2>
      {shownMatches.length ? (
        <JobList jobs={shownMatches} />
      ) : (
        <p className="mt-3 rounded-xl border border-line bg-surface p-4 text-dim">
          {matches.length ? "No matches fit these filters." : `No jobs have scored ${minScore} or more yet.`}
        </p>
      )}

      <Collapsed title="Below your minimum score" jobs={visible(below)} />
      <Collapsed title="Waiting to be scored" jobs={visible(waiting)} />
    </section>
  );
}
