import { requireApiSession } from "@/lib/auth";
import { resultResponse } from "@/lib/household/forms";
import { deleteRun } from "@/lib/household/payroll";

/** Deletes a draft run. An approved or paid run is refused until it's reopened. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;
  return resultResponse(await deleteRun((await params).runId));
}
