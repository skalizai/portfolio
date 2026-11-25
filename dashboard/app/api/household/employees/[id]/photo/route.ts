import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveUpload } from "@/lib/household/files";

/** Sets or replaces an employee's photo (JPEG, PNG or WebP). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const id = (await params).id;
  const employee = await db().employee.findFirst({ where: { id, deletedAt: null }, select: { photoFileId: true } });
  if (!employee) return Response.json({ error: "Employee not found." }, { status: 404 });
  const file = (await request.formData().catch(() => null))?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a photo." }, { status: 400 });
  if (!file.type.startsWith("image/")) return Response.json({ error: "Please choose a JPEG, PNG or WebP photo." }, { status: 400 });

  const saved = await saveUpload(file);
  if (!saved.ok) return Response.json({ error: saved.error }, { status: 400 });
  await db().employee.update({ where: { id }, data: { photoFileId: saved.id } });
  if (employee.photoFileId) await db().storedFile.deleteMany({ where: { id: employee.photoFileId } });
  return Response.json({ id: saved.id }, { status: 201 });
}
