import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/household/audit";
import { FAMILY_DOCUMENT_LABELS, type FamilyDocumentType } from "@/lib/household/family";
import { saveUpload } from "@/lib/household/files";

/** Attaches a copy of a passport, CNIC and so on (PDF or image, up to 5 MB), with an optional expiry. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const familyMemberId = (await params).id;
  const member = await db().familyMember.findFirst({ where: { id: familyMemberId, deletedAt: null }, select: { id: true } });
  if (!member) return Response.json({ error: "Family member not found." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const type = String(form?.get("type") ?? "");
  const expiry = String(form?.get("expiry") ?? "");
  if (!(file instanceof File)) return Response.json({ error: "Choose a file to upload." }, { status: 400 });
  if (!(type in FAMILY_DOCUMENT_LABELS)) return Response.json({ error: "Choose what kind of document it is." }, { status: 400 });
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return Response.json({ error: "Enter the expiry as a date." }, { status: 400 });

  const saved = await saveUpload(file);
  if (!saved.ok) return Response.json({ error: saved.error }, { status: 400 });
  const document = await db().familyDocument.create({
    data: { familyMemberId, type: type as FamilyDocumentType, fileId: saved.id, expiry: expiry ? new Date(`${expiry}T00:00:00Z`) : null },
  });
  await audit(db(), { entity: "FamilyDocument", entityId: document.id, action: "create", after: document });
  return Response.json({ id: document.id }, { status: 201 });
}
