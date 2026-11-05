import { isValidCronRequest } from "@/lib/access";
import { processDueSends } from "@/lib/apply/send";
import { requireApiSession } from "@/lib/auth";

export const maxDuration = 120;

/**
 * Sends emails whose undo window has passed. The scheduler may call this, because the only emails
 * in the queue are ones you've already confirmed. It can't add anything to the queue.
 */
export async function POST(request: Request) {
  if (!isValidCronRequest(request.headers.get("authorization"))) {
    const denied = await requireApiSession();
    if (denied) return denied;
  }

  return Response.json(await processDueSends());
}
