import { requireApiSession } from "@/lib/auth";
import { createDueRecurring, createRecurring, RecurringInputSchema } from "@/lib/household/expenses";
import { resultResponse } from "@/lib/household/forms";

/** Adds a monthly expense; this month's is created straight away if its day has passed. */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = RecurringInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  const result = await createRecurring(body.data);
  if (result.ok) await createDueRecurring();
  return resultResponse(result, true);
}
