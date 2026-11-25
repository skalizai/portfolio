import { zipSync } from "fflate";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isMonth } from "@/lib/household/money";
import { type PayslipSnapshot, payslipFilename } from "@/lib/household/payslip";

export const maxDuration = 60;

/** Every payslip for a paid month, as one ZIP of PDFs. */
export async function GET(request: Request) {
  const denied = await requireApiSession();
  if (denied) return denied;

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!isMonth(month)) return Response.json({ error: "Choose a month." }, { status: 400 });
  const payslips = await db().payslip.findMany({ where: { run: { month } }, orderBy: { employee: { fullName: "asc" } } });
  if (!payslips.length) return Response.json({ error: "There are no payslips for that month. Payslips are made when payroll is marked paid." }, { status: 404 });

  const { renderPayslipPdf } = await import("@/lib/household/payslipPdf");
  const files: Record<string, Uint8Array> = {};
  for (const payslip of payslips) {
    const snapshot = payslip.snapshot as PayslipSnapshot;
    let name = payslipFilename(snapshot);
    // Two employees with the same name still get a file each.
    for (let n = 2; files[name]; n++) name = payslipFilename(snapshot).replace(/\.pdf$/, ` (${n}).pdf`);
    files[name] = new Uint8Array(await renderPayslipPdf(payslip.id, snapshot));
  }
  // PDFs are already compressed, so they're stored rather than squeezed again.
  const zip = zipSync(files, { level: 0 });
  return new Response(zip as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="Payslips ${month}.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
