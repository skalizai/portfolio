import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { type PayslipSnapshot, payslipFilename } from "@/lib/household/payslip";

export const maxDuration = 30;

/** One payslip as a PDF. Opens in the browser, or downloads with ?download. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const payslip = await db().payslip.findUnique({ where: { id: (await params).id } });
  if (!payslip) return Response.json({ error: "Payslip not found." }, { status: 404 });
  const snapshot = payslip.snapshot as PayslipSnapshot;
  // Loaded here so the PDF library is only pulled in when a payslip is actually made.
  const { renderPayslipPdf } = await import("@/lib/household/payslipPdf");
  const pdf = await renderPayslipPdf(payslip.id, snapshot, payslip.language === "en" ? "en" : "en");
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(payslipFilename(snapshot))}`,
      "cache-control": "private, no-store",
    },
  });
}
