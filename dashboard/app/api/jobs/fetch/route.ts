import { isValidCronRequest } from "@/lib/access";
import { requireApiSession } from "@/lib/auth";
import { runJobFetch } from "@/lib/jobs/fetchJobs";

export const maxDuration = 120;

/** Runs all enabled job sources. Called by the scheduler with CRON_SECRET, or by "Refresh now". */
export async function POST(request: Request) {
  if (!isValidCronRequest(request.headers.get("authorization"))) {
    const denied = await requireApiSession();
    if (denied) return denied;
  }

  return Response.json(await runJobFetch());
}
