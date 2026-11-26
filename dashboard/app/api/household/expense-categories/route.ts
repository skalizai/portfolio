import { requireApiSession } from "@/lib/auth";
import { CategoryInputSchema, createCategory } from "@/lib/household/expenses";
import { resultResponse } from "@/lib/household/forms";

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = CategoryInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  return resultResponse(await createCategory(body.data), true);
}
