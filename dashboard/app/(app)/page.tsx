import { JobsBoard } from "@/components/JobsBoard";
import { getJobsOverview } from "@/lib/jobs/overview";

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Dubai",
});

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <dt className="text-sm text-dim">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

export default async function MatchesPage() {
  const { jobs, totalJobs, newJobs, applicationsThisWeek, lastSearchAt } = await getJobsOverview();

  return (
    <>
      <h1 className="text-2xl font-semibold">Matches</h1>
      <p className="mt-2 text-dim">
        Scoring isn&apos;t switched on yet, so this lists every job found, newest first.
        {totalJobs > jobs.length ? ` Showing the latest ${jobs.length} of ${totalJobs}.` : ""}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="New in 24 hours" value={newJobs} />
        <Stat label="Jobs found" value={totalJobs} />
        <Stat label="Applications this week" value={applicationsThisWeek} />
        <Stat label="Last search, Gulf time" value={lastSearchAt ? timeFormat.format(lastSearchAt) : "Not yet"} />
      </dl>

      <JobsBoard jobs={jobs} />
    </>
  );
}
