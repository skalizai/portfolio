import { isValidCronRequest } from "@/lib/access";
import { requireApiSession } from "@/lib/auth";
import { sendDigest } from "@/lib/notify/digest";

export const maxDuration = 60;

/** Emails you the new top matches. It only ever writes to your own address. */
export async function POST(request: Request) {
  if (!isValidCronRequest(request.headers.get("authorization"))) {
    const denied = await requireApiSession();
    if (denied) return denied;
  }

  try {
    return Response.json(await sendDigest());
  } catch {
    // SMTP errors can echo account details, so only a general message is returned.
    return Response.json({ status: "failed", message: "The email couldn't be sent. Check your Yahoo app password, then try again." }, { status: 502 });
  }
}
