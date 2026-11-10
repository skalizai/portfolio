import { requireApiSession } from "@/lib/auth";
import { PriceInputSchema, setManualPrice } from "@/lib/investments/service";

/** Records a price you've entered yourself, which counts until a newer one arrives. */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = PriceInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid price" }, { status: 400 });
  const quote = await setManualPrice(body.data.instrumentId, body.data.price);
  return quote ? Response.json({ ok: true }, { status: 201 }) : Response.json({ error: "That holding doesn't exist." }, { status: 404 });
}
