import { z } from "zod";
import { startPasswordReset } from "@/lib/security/flows";

/** Open without a session. Always answers the same way, so it doesn't reveal which email is yours. */
export async function POST(request: Request) {
  const body = z.object({ email: z.string().max(200) }).safeParse(await request.json().catch(() => null));
  if (body.success) await startPasswordReset(body.data.email);
  return Response.json({ ok: true });
}
