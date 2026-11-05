import { cancelSend } from "@/lib/apply/send";
import { requireApiSession } from "@/lib/auth";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  return (await cancelSend((await params).id))
    ? Response.json({ status: "DRAFT" })
    : Response.json({ error: "It's too late to cancel, or it wasn't waiting to send." }, { status: 409 });
}
