import { requireApiSession } from "@/lib/auth";
import { resultResponse } from "@/lib/household/forms";
import { RecipientInputSchema, removeRecipient, updateRecipient } from "@/lib/household/remittances";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = RecipientInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  return resultResponse(await updateRecipient((await params).id, body.data));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;
  return resultResponse(await removeRecipient((await params).id));
}
