import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

const PatchSchema = z.object({ isActive: z.boolean().optional(), name: z.string().trim().min(1).max(100).optional(), notes: z.string().trim().max(500).optional() });

export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Invalid change" }, { status: 400 });
  const { count } = await db().account.updateMany({ where: { id: (await params).id }, data: body.data });
  return count ? Response.json({ ok: true }) : Response.json({ error: "Account not found." }, { status: 404 });
}

/** Only an account with no transactions can be deleted. Others can be archived instead. */
export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const id = (await params).id;
  if (await db().transaction.count({ where: { accountId: id } })) {
    return Response.json({ error: "This account has transactions. Archive it instead, or delete its transactions first." }, { status: 409 });
  }
  const { count } = await db().account.deleteMany({ where: { id } });
  return count ? Response.json({ ok: true }) : Response.json({ error: "Account not found." }, { status: 404 });
}
