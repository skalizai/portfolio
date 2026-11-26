import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { removeRecurring, setRecurringActive } from "@/lib/household/expenses";
import { resultResponse } from "@/lib/household/forms";

type Context = { params: Promise<{ id: string }> };

/** Pauses or resumes a recurring expense. */
export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = z.object({ isActive: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Say whether it's active" }, { status: 400 });
  return resultResponse(await setRecurringActive((await params).id, body.data.isActive));
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;
  return resultResponse(await removeRecurring((await params).id));
}
