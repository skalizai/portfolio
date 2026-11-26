import { requireApiSession } from "@/lib/auth";
import { createRecipient, RecipientInputSchema } from "@/lib/household/remittances";

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = RecipientInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  const recipient = await createRecipient(body.data);
  return Response.json({ id: recipient.id }, { status: 201 });
}
