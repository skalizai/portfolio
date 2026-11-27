import { requireApiSession } from "@/lib/auth";
import { endAllSessions } from "@/lib/security/flows";

/** Ends every session on every device, this one included. */
export async function POST() {
  const denied = await requireApiSession();
  if (denied) return denied;
  await endAllSessions();
  return Response.json({ ok: true });
}
