import { z } from "zod";
import { confirmPasswordReset } from "@/lib/security/flows";

const Body = z.object({ email: z.string().max(200), code: z.string().max(20), next: z.string().max(400) });

/** Open without a session: the emailed code and a new password. */
export async function POST(request: Request) {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Enter your email, the code and a new password." }, { status: 400 });
  const result = await confirmPasswordReset(body.data.email, body.data.code, body.data.next);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
}
