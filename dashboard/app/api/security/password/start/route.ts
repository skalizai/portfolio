import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { startPasswordChange } from "@/lib/security/flows";

const Body = z.object({ current: z.string().max(200), next: z.string().max(400) });

/** Checks your current password and the new one, then emails a code to confirm. */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Enter your current and new passwords." }, { status: 400 });
  const result = await startPasswordChange(body.data.current, body.data.next);
  return result.ok ? Response.json({ sentTo: result.sentTo }) : Response.json({ error: result.error }, { status: result.status });
}
