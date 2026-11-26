import { requireApiSession } from "@/lib/auth";
import { confirmExpense, ExpenseInputSchema, removeExpense, updateExpense } from "@/lib/household/expenses";
import { readFormWithFile, resultResponse } from "@/lib/household/forms";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const form = await readFormWithFile(request, ExpenseInputSchema, "receipt");
  if (!form.ok) return form.response;
  return resultResponse(await updateExpense((await params).id, form.data, form.fileId));
}

/** Confirms a pending expense. */
export async function PATCH(_request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;
  return resultResponse(await confirmExpense((await params).id));
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;
  return resultResponse(await removeExpense((await params).id));
}
