import { requireApiSession } from "@/lib/auth";
import { EmployeeInputSchema, removeEmployee, updateEmployee } from "@/lib/household/employees";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const body = EmployeeInputSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: body.error.issues[0]?.message ?? "Please check the form" }, { status: 400 });
  const employee = await updateEmployee((await params).id, body.data);
  return employee ? Response.json({ id: employee.id }) : Response.json({ error: "Employee not found." }, { status: 404 });
}

/** Removes the employee from the lists. Their payroll history and payslips are kept. */
export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireApiSession();
  if (denied) return denied;
  return (await removeEmployee((await params).id)) ? Response.json({ ok: true }) : Response.json({ error: "Employee not found." }, { status: 404 });
}
