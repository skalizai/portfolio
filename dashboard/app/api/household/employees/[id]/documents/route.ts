import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/household/audit";
import { saveUpload } from "@/lib/household/files";

const TYPES = ["CONTRACT", "CNIC", "CANTT_PASS", "OTHER"] as const;

/** Attaches a document (PDF or image, up to 5 MB) to an employee, with an optional expiry date. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const employeeId = (await params).id;
  const employee = await db().employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true } });
  if (!employee) return Response.json({ error: "Employee not found." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const type = String(form?.get("type") ?? "");
  const expiry = String(form?.get("expiry") ?? "");
  if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  if (!(TYPES as readonly string[]).includes(type)) return Response.json({ error: "Choose what kind of document it is." }, { status: 400 });
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return Response.json({ error: "Enter the expiry as a date." }, { status: 400 });

  const saved = await saveUpload(file);
  if (!saved.ok) return Response.json({ error: saved.error }, { status: 400 });
  const document = await db().employeeDocument.create({
    data: { employeeId, type: type as (typeof TYPES)[number], fileId: saved.id, expiry: expiry ? new Date(`${expiry}T00:00:00Z`) : null },
  });
  await audit(db(), { entity: "EmployeeDocument", entityId: document.id, action: "create", after: document });
  return Response.json({ id: document.id }, { status: 201 });
}
