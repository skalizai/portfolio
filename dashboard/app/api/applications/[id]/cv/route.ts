import { TailoredCvSchema } from "@/lib/apply/cvSchema";
import { renderCvPdf } from "@/lib/apply/cvPdf";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const maxDuration = 60;

/** Builds the PDF from the draft as it stands, so your edits are always included. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const application = await db().application.findUnique({ where: { id: (await params).id }, select: { tailoredCv: true } });
  const cv = TailoredCvSchema.safeParse(application?.tailoredCv);
  if (!cv.success) return Response.json({ error: "This application has no CV yet." }, { status: 404 });

  const pdf = await renderCvPdf(cv.data);
  const fileName = `CV - ${cv.data.name}.pdf`.replace(/[^A-Za-z0-9 .-]/g, "");
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store" },
  });
}
