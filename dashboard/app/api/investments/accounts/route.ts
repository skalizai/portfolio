import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AccountInputSchema, createAccount } from "@/lib/investments/service";

export async function GET() {
  const denied = await requireApiSession();
  if (denied) return denied;
  return Response.json(await db().account.findMany({ orderBy: { createdAt: "asc" } }));
}

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = AccountInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid account" }, { status: 400 });
  return Response.json(await createAccount(body.data), { status: 201 });
}
