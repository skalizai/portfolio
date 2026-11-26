import { requireApiSession } from "@/lib/auth";
import { createExpense, ExpenseInputSchema } from "@/lib/household/expenses";
import { readFormWithFile, resultResponse } from "@/lib/household/forms";

/** Records an expense, with an optional receipt (PDF or image, up to 5 MB). */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const form = await readFormWithFile(request, ExpenseInputSchema, "receipt");
  if (!form.ok) return form.response;
  return resultResponse(await createExpense(form.data, form.fileId), true);
}
