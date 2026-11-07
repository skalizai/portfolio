import { isValidCronRequest } from "@/lib/access";
import { prepareNewMatches } from "@/lib/apply/prepare";
import { scoreNewJobs } from "@/lib/matching/scoreJobs";
import { sendDigest } from "@/lib/notify/digest";

export const maxDuration = 300;

/**
 * Runs two hours after the search, by Vercel Cron with CRON_SECRET. It scores anything the search
 * left over, prepares cover letters for the best matches, then emails you the new top matches.
 * Nothing is ever sent to an employer.
 */
export async function GET(request: Request) {
  if (!isValidCronRequest(request.headers.get("authorization"))) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const scored = await scoreNewJobs();
  const drafts = await prepareNewMatches();
  let digest: Awaited<ReturnType<typeof sendDigest>> | { status: "failed" };
  try {
    digest = await sendDigest();
  } catch {
    // SMTP errors can echo account details, so only the outcome is reported.
    digest = { status: "failed" };
  }
  return Response.json({ scored: scored.scored, drafts: drafts.created, draftErrors: drafts.errors, digest: digest.status });
}
