import { isValidCronRequest } from "@/lib/access";
import { prepareNewMatches } from "@/lib/apply/prepare";
import { requireApiSession } from "@/lib/auth";

export const maxDuration = 300;

/** Prepares drafts for the best new matches. Called by the morning run. Nothing is sent. */
export async function POST(request: Request) {
  if (!isValidCronRequest(request.headers.get("authorization"))) {
    const denied = await requireApiSession();
    if (denied) return denied;
  }

  return Response.json(await prepareNewMatches());
}
