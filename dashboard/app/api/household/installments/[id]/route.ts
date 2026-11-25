import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { changeInstallment } from "@/lib/household/advances";

const BodySchema = z.object({
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount in rupees, or 0 to skip this month"),
  note: z.string().trim().max(300).default(""),
});

/** Changes or skips one month's advance repayment. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the amount" }, { status: 400 });
  const result = await changeInstallment((await params).id, body.data.amount, body.data.note);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
}
