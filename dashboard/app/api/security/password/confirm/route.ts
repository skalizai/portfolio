import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { confirmPasswordChange } from "@/lib/security/flows";

/** The emailed code. Saves the new password and signs out every device. */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = z.object({ code: z.string().max(20) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Enter the code from the email." }, { status: 400 });
  const result = await confirmPasswordChange(body.data.code);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
}
