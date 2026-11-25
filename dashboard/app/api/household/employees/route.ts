import { requireApiSession } from "@/lib/auth";
import { createEmployee, EmployeeInputSchema, listEmployees } from "@/lib/household/employees";

export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  return Response.json(await listEmployees({ q: params.get("q") ?? undefined, status: params.get("status") ?? undefined }));
}

export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = EmployeeInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  const employee = await createEmployee(body.data);
  return Response.json({ id: employee.id }, { status: 201 });
}
