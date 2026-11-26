import { requireApiSession } from "@/lib/auth";
import { readFormWithFile, resultResponse } from "@/lib/household/forms";
import { RemittanceInputSchema, removeRemittance, updateRemittance } from "@/lib/household/remittances";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const form = await readFormWithFile(request, RemittanceInputSchema, "receipt");
  if (!form.ok) return form.response;
  return resultResponse(await updateRemittance((await params).id, form.data, form.fileId));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;
  return resultResponse(await removeRemittance((await params).id));
}
