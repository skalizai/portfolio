import { isValidCronRequest } from "@/lib/access";
import { requireApiSession } from "@/lib/auth";
import { scoreNewJobs } from "@/lib/matching/scoreJobs";

export const maxDuration = 120;

/** Scores jobs that haven't been scored yet. Called by the scheduler, or by "Refresh now". */
export async function POST(request: Request) {
  if (!isValidCronRequest(request.headers.get("authorization"))) {
    const denied = await requireApiSession();
    if (denied) return denied;
  }

  return Response.json(await scoreNewJobs());
}
