import { db } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_JOBS = 200;

/** Everything the Matches page shows. Applications that are only drafted don't count as applied. */
export async function getJobsOverview(now = new Date()) {
  const [jobs, totalJobs, newJobs, applicationsThisWeek, lastRun] = await Promise.all([
    db().job.findMany({
      where: { state: { not: "DISMISSED" } },
      orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { fetchedAt: "desc" }],
      take: MAX_JOBS,
      select: {
        id: true,
        title: true,
        company: true,
        location: true,
        workMode: true,
        employmentType: true,
        url: true,
        applyChannel: true,
        publisher: true,
        postedAt: true,
      },
    }),
    db().job.count({ where: { state: { not: "DISMISSED" } } }),
    db().job.count({ where: { state: { not: "DISMISSED" }, fetchedAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
    db().application.count({ where: { submittedAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } } }),
    db().auditLog.findFirst({ where: { action: "jobs.fetch" }, orderBy: { at: "desc" }, select: { at: true } }),
  ]);

  return { jobs, totalJobs, newJobs, applicationsThisWeek, lastSearchAt: lastRun?.at ?? null };
}

export type JobsOverview = Awaited<ReturnType<typeof getJobsOverview>>;
export type JobRow = JobsOverview["jobs"][number];
