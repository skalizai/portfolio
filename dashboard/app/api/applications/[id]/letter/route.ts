import { TailoredCvSchema } from "@/lib/apply/cvSchema";
import { renderLetterPdf } from "@/lib/apply/cvPdf";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";

export const maxDuration = 60;

/** The cover letter as it stands, so your edits are always included. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const application = await db().application.findUnique({
    where: { id: (await params).id },
    select: { coverLetter: true, tailoredCv: true, job: { select: { company: true } } },
  });
  const cv = TailoredCvSchema.safeParse(application?.tailoredCv);
  if (!application?.coverLetter?.trim() || !cv.success) return Response.json({ error: "This application has no cover letter yet." }, { status: 404 });

  const pdf = await renderLetterPdf(application.coverLetter, cv.data, new Date());
  const fileName = `Cover Letter - ${cv.data.name} - ${application.job.company}.pdf`.replace(/[^A-Za-z0-9 .-]/g, "");
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store" },
  });
}
