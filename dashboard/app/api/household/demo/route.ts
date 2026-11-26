import { requireApiSession } from "@/lib/auth";
import { clearDemoData, loadDemoData } from "@/lib/household/demo";

export const maxDuration = 60;

/** Loads sample staff, payroll, transfers and expenses, all marked as demo. */
export async function POST() {
  const denied = await requireApiSession();
  if (denied) return denied;
  const result = await loadDemoData();
  return result.ok ? Response.json(result, { status: 201 }) : Response.json({ error: result.error }, { status: result.status });
}

/** Removes the demo data, and nothing else. */
export async function DELETE() {
  const denied = await requireApiSession();
  if (denied) return denied;
  return Response.json(await clearDemoData());
}
