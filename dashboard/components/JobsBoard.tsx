"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { JobRow } from "@/lib/jobs/overview";
import type { FetchReport } from "@/lib/jobs/fetchJobs";

const CHANNELS: Record<JobRow["applyChannel"], string> = {
  EMAIL: "Apply by email",
  ATS_FORM: "Application form",
  LINKEDIN_EASY_APPLY: "LinkedIn",
  COMPANY_SITE: "Company or job site",
  UNKNOWN: "Check the listing",
};

const FIELD = "w-full rounded-md border border-line-strong bg-bg px-3 py-2 text-sm text-txt";

// A fixed locale and time zone, so the server and browser render the same text.
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });

function refreshMessage(report: FetchReport): string {
  const sources = Object.values(report.sources);
  const errors = sources.flatMap((source) => source.errors);
  if (errors.length) return errors[0]!;
  if (!sources.length) return "No job source is set up yet.";
  if (sources.every((source) => source.requests === 0)) return "Today's search allowance is used up. The next search runs tomorrow.";
  if (!report.inserted) return "Search finished. No new jobs this time.";
  return `Search finished. ${report.inserted} new ${report.inserted === 1 ? "job" : "jobs"}.`;
}

export function JobsBoard({ jobs }: { jobs: JobRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return jobs.filter(
      (job) =>
        (!channel || job.applyChannel === channel) &&
        (!needle || [job.title, job.company, job.location].some((text) => text?.toLowerCase().includes(needle))),
    );
  }, [jobs, query, channel]);

  async function refresh() {
    setRefreshing(true);
    setMessage("Searching…");
    const response = await fetch("/api/jobs/fetch", { method: "POST" }).catch(() => null);
    setRefreshing(false);
    if (!response?.ok) {
      setMessage("The search didn't finish. Please try again.");
      return;
    }
    setMessage(refreshMessage(await response.json()));
    router.refresh();
  }

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

      {visible.length === 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-dim">
          {jobs.length ? "No jobs match these filters." : "No jobs yet. Use Refresh now, or wait for the morning search."}
        </p>
      ) : (
        <ul className="mt-2 grid gap-3">
          {visible.map((job) => (
            <li key={job.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 basis-64">
                  <h2 className="font-semibold break-words">{job.title}</h2>
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
                <Button asChild variant="ghost" size="sm" className="border border-line-strong">
                  <a href={job.url} target="_blank" rel="noopener noreferrer">
                    Open listing <span className="sr-only">for {job.title} at {job.company}, opens in a new tab</span>
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
