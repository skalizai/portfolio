import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { addLine, approveRun, PayInputSchema, payRun, reopenRun } from "@/lib/household/payroll";

type Context = { params: Promise<{ runId: string; action: string }> };

/** Approve, pay, reopen, or add an employee to a run. */
export async function POST(request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const { runId, action } = await params;
  const body = await request.json().catch(() => ({}));
  let result;
  if (action === "approve") result = await approveRun(runId);
  else if (action === "pay") {
    const input = PayInputSchema.safeParse(body);
    if (!input.success) return Response.json({ error: input.error.issues[0]?.message ?? "Please check the payment details" }, { status: 400 });
    result = await payRun(runId, input.data);
  } else if (action === "reopen") {
    const input = z.object({ reason: z.string().max(300).default("") }).safeParse(body);
    result = await reopenRun(runId, input.success ? input.data.reason : "");
  } else if (action === "lines") {
    const input = z.object({ employeeId: z.string().min(1) }).safeParse(body);
    if (!input.success) return Response.json({ error: "Choose an employee." }, { status: 400 });
    result = await addLine(runId, input.data.employeeId);
  } else return Response.json({ error: "Unknown action." }, { status: 404 });

  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
}
