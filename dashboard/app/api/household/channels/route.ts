import { requireApiSession } from "@/lib/auth";
import { addChannel, ChannelInputSchema } from "@/lib/household/bank-accounts";

/** Adds a transfer channel, such as an exchange house or a bank app. */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = ChannelInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Enter the channel's name" }, { status: 400 });
  const result = await addChannel(body.data.name);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ id: result.id }, { status: 201 });
}
