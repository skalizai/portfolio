import { isValidCronRequest } from "@/lib/access";
import { runJobFetch } from "@/lib/jobs/fetchJobs";
import { scoreNewJobs } from "@/lib/matching/scoreJobs";

export const maxDuration = 300;

/**
 * The morning search, run by Vercel Cron with CRON_SECRET: fetches new jobs, then scores them. Each
 * step stops starting new work in good time, so this fits within the time Vercel allows.
 */
export async function GET(request: Request) {
  if (!isValidCronRequest(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const fetched = await runJobFetch();
  const scored = await scoreNewJobs();
  return Response.json({ inserted: fetched.inserted, scored: scored.scored, more: scored.more, errors: scored.errors });
}
