import { isValidCronRequest } from "@/lib/access";
import { scoreNewJobs } from "@/lib/matching/scoreJobs";
import { sendDigest } from "@/lib/notify/digest";

export const maxDuration = 300;

/**
 * Runs two hours after the search, by Vercel Cron with CRON_SECRET. It scores anything the search
 * left over, then emails you the new top matches. Cover letters are only prepared when you ask for
 * one in the dashboard, which keeps Claude costs down. Nothing is ever sent to an employer.
 */
export async function GET(request: Request) {
  if (!isValidCronRequest(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const scored = await scoreNewJobs();
  let digest: Awaited<ReturnType<typeof sendDigest>> | { status: "failed" };
  try {
    digest = await sendDigest();
  } catch {
    // Email errors can include account details, so only the outcome is reported.
    digest = { status: "failed" };
  }
  return Response.json({ scored: scored.scored, digest: digest.status });
}
