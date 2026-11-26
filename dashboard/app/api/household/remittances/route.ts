import { requireApiSession } from "@/lib/auth";
import { readFormWithFile, resultResponse } from "@/lib/household/forms";
import { createRemittance, RemittanceInputSchema } from "@/lib/household/remittances";

/** Records a transfer home, with an optional receipt (PDF or image, up to 5 MB). */
export async function POST(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;
  const form = await readFormWithFile(request, RemittanceInputSchema, "receipt");
  if (!form.ok) return form.response;
  return resultResponse(await createRemittance(form.data, form.fileId), true);
}
