import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/household/PrintButton";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { hasCnic, longDate, PAYSLIP_TEXT, type PayslipSnapshot, payslipNumber, periodLabel, rupees } from "@/lib/household/payslip";

function Amounts({ title, rows, total, totalLabel, empty }: { title: string; rows: { label: string; amount: string }[]; total: string; totalLabel: string; empty: string }) {
  return (
    <section className="rounded-xl border border-line p-4 print:border-black/30">
      <h2 className="border-b border-line pb-1 font-semibold">{title}</h2>
      {rows.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {rows.map((row, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="min-w-0 break-words">{row.label}</span>
              <span className="shrink-0 font-mono">{rupees(row.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-dim">{empty}</p>
      )}
      <p className="mt-2 flex justify-between border-t border-line pt-1 text-sm font-semibold">
        <span>{totalLabel}</span>
        <span className="font-mono">{rupees(total)}</span>
      </p>
    </section>
  );
}

/** A payslip laid out for the screen and for printing; the menus are hidden when printed. */
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const payslip = await db().payslip.findUnique({ where: { id: (await params).id } });
  if (!payslip) notFound();
  const s = payslip.snapshot as PayslipSnapshot;
  const t = PAYSLIP_TEXT.en;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/household/payslips" className="inline-flex items-center gap-1 text-sm text-dim hover:text-txt">
          <ArrowLeft aria-hidden className="size-4" /> All payslips
        </Link>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          <Button asChild variant="ghost" className="h-11 border border-line-strong">
            <a href={`/api/household/payslips/${payslip.id}?download`} download>
              <FileText aria-hidden className="size-4" /> Download PDF
            </a>
          </Button>
        </div>
      </div>

      <article aria-labelledby="payslip-title" className="mx-auto mt-4 max-w-3xl rounded-[1.5rem] border border-line bg-surface p-6 print:mt-0 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:text-black">
        <header className="flex flex-wrap justify-between gap-4 border-b-2 border-txt pb-3 print:border-black">
          <div className="min-w-0">
            <p className="font-display text-xl font-semibold break-words">{s.employer.name}</p>
            {s.employer.address && <p className="text-sm text-dim print:text-black/70">{s.employer.address}</p>}
          </div>
          <div className="text-right">
            <h1 id="payslip-title" className="text-lg font-semibold">
              {t.title}
            </h1>
            <p className="text-sm text-dim print:text-black/70">
              {t.period}: {periodLabel(s.month)}
            </p>
            <p className="text-sm text-dim print:text-black/70">
              {t.payslipNo}: {payslipNumber(payslip.id, s.month)}
            </p>
          </div>
        </header>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <dl className="rounded-xl border border-line p-4 text-sm print:border-black/30">
            <dt className="text-xs text-dim uppercase print:text-black/70">{t.employee}</dt>
            <dd className="font-semibold">{s.employee.name}</dd>
            <dt className="mt-2 text-xs text-dim uppercase print:text-black/70">{t.role}</dt>
            <dd>{s.employee.role}</dd>
            <dt className="mt-2 text-xs text-dim uppercase print:text-black/70">{hasCnic(s) ? `${t.cnic} · ${t.joined}` : t.joined}</dt>
            <dd>{hasCnic(s) ? `${s.employee.cnic} · ${longDate(s.employee.joiningDate)}` : longDate(s.employee.joiningDate)}</dd>
          </dl>
          <dl className="rounded-xl border border-line p-4 text-sm print:border-black/30">
            <dt className="text-xs text-dim uppercase print:text-black/70">{t.paidOn}</dt>
            <dd>{longDate(s.payment.date)}</dd>
            <dt className="mt-2 text-xs text-dim uppercase print:text-black/70">{t.paidBy}</dt>
            <dd>{s.payment.method}</dd>
            {s.payment.reference && (
              <>
                <dt className="mt-2 text-xs text-dim uppercase print:text-black/70">{t.reference}</dt>
                <dd>{s.payment.reference}</dd>
              </>
            )}
          </dl>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          <Amounts title={t.earnings} rows={s.earnings} total={s.gross} totalLabel={t.gross} empty="" />
          <Amounts title={t.deductions} rows={s.deductions} total={s.totalDeductions} totalLabel={t.totalDeductions} empty={t.noDeductions} />
        </div>

        <p className="mt-5 flex justify-between rounded-xl border-2 border-txt p-4 text-lg font-semibold print:border-black">
          <span>{t.net}</span>
          <span className="font-mono">{rupees(s.net)}</span>
        </p>
        <p className="mt-2 flex justify-between text-sm text-dim print:text-black/70">
          <span>{t.advanceBalance}</span>
          <span className="font-mono">{rupees(s.advanceOutstanding)}</span>
        </p>
        <p className="mt-1 text-sm text-dim print:text-black/70">{t.amountsIn}</p>

        <div className="mt-16 grid grid-cols-2 gap-10 text-sm">
          <p className="border-t border-txt pt-1 print:border-black">
            {t.employerSignature}
            <span className="block text-dim print:text-black/70">{t.date}:</span>
          </p>
          <p className="border-t border-txt pt-1 print:border-black">
            {t.receivedBy}
            <span className="block text-dim print:text-black/70">{t.date}:</span>
          </p>
        </div>
      </article>
    </>
  );
}
