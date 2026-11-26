import { requireApiSession } from "@/lib/auth";
import { FamilyMemberInputSchema, removeFamilyMember, updateFamilyMember } from "@/lib/household/family";
import { resultResponse } from "@/lib/household/forms";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = FamilyMemberInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  return resultResponse(await updateFamilyMember((await params).id, body.data));
}

/** Hides the family member. Money already sent to them stays in the totals. */
export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;
  return resultResponse(await removeFamilyMember((await params).id));
}
