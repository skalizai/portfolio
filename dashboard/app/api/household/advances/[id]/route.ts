import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { changeMonthlyAmount, removeAdvance } from "@/lib/household/advances";
import { isMonth } from "@/lib/household/money";

const BodySchema = z.object({
  perMonth: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter the monthly amount in rupees, like 5000"),
  startMonth: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || isMonth(v), "Choose the first month"),
});

/** Changes the monthly repayment for what's still owed. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the amount" }, { status: 400 });
  const result = await changeMonthlyAmount((await params).id, body.data.perMonth, body.data.startMonth);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const result = await removeAdvance((await params).id);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
}
