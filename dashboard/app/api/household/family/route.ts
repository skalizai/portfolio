import { requireApiSession } from "@/lib/auth";
import { createFamilyMember, FamilyMemberInputSchema } from "@/lib/household/family";
import { resultResponse } from "@/lib/household/forms";

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = FamilyMemberInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  return resultResponse(await createFamilyMember(body.data), true);
}
