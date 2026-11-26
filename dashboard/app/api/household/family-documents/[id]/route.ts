import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/household/audit";

/** Deletes a family document and its file. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const id = (await params).id;
  const document = await db().familyDocument.findUnique({ where: { id } });
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
  await db().$transaction([db().familyDocument.delete({ where: { id } }), db().storedFile.deleteMany({ where: { id: document.fileId } })]);
  await audit(db(), { entity: "FamilyDocument", entityId: id, action: "delete", before: document });
  return Response.json({ ok: true });
}
