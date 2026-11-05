import { JobsBoard } from "@/components/JobsBoard";
import { getJobsOverview } from "@/lib/jobs/overview";
import { getScreeningAnswers } from "@/lib/search/screening";

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
  const [{ matches, sponsorshipUnknown, below, waiting, minScore, applicantName, emailReady, newMatches, averageScore, applicationsThisWeek, responseRate, lastSearchAt }, screening] = await Promise.all([
    getJobsOverview(),
    getScreeningAnswers(),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold">Matches</h1>
      <p className="mt-2 text-dim">
        Jobs scoring {minScore} or more against your profile, best first.{" "}
        {lastSearchAt ? `Last search: ${timeFormat.format(lastSearchAt)} Gulf time.` : "No search has run yet."}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="New matches today" value={newMatches} />
        <Stat label="Average score" value={averageScore ?? "None yet"} />
        <Stat label="Applications this week" value={applicationsThisWeek} />
        <Stat label="Response rate" value={responseRate === null ? "None yet" : `${responseRate}%`} />
      </dl>

      <JobsBoard matches={matches} sponsorshipUnknown={sponsorshipUnknown} below={below} waiting={waiting} minScore={minScore} applicantName={applicantName} emailReady={emailReady} screening={screening} />
    </>
  );
}
