import { requireApiSession } from "@/lib/auth";
import { addBankAccount, BankAccountInputSchema } from "@/lib/household/bank-accounts";

/** Adds a bank account to a family member. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = BankAccountInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Check the account details." }, { status: 400 });
  const result = await addBankAccount((await params).id, body.data);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ id: result.id }, { status: 201 });
}
