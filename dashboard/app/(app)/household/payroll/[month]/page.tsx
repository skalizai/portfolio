import { ArrowLeft, Download, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddLineForm, PayrollLineEditor, RunActions } from "@/components/household/PayrollForms";
import { RemoveButton } from "@/components/household/RemoveButton";
import { Button } from "@/components/ui/button";
import { listEmployees } from "@/lib/household/employees";
import { formatPkr, isMonth } from "@/lib/household/money";
import { getRun } from "@/lib/household/payroll";
import type { Deduction, Earning } from "@/lib/household/payroll-calc";

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const STATUS = { DRAFT: "Draft", APPROVED: "Approved", PAID: "Paid" } as const;

function Amounts({ title, rows }: { title: string; rows: { label: string; amount: string }[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      {rows.length ? (
        <ul className="mt-1 space-y-1 text-sm">
          {rows.map((row, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="min-w-0 break-words text-dim">{row.label}</span>
              <span className="shrink-0 font-mono">{formatPkr(row.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-dim">None</p>
      )}
    </div>
  );
}

export default async function PayrollMonthPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!isMonth(month)) notFound();
  const run = await getRun(month);
  if (!run) notFound();
  const employees = await listEmployees();
  const included = new Set(run.lines.map((l) => l.employeeId));
  const missing = employees.filter((e) => !included.has(e.id) && e.status !== "LEFT").map((e) => ({ id: e.id, name: e.fullName }));
  const locked = run.status !== "DRAFT";
  const title = monthFormat.format(new Date(`${month}-01T00:00:00Z`));

  return (
    <>
      <Link href="/household/payroll" className="inline-flex items-center gap-1 text-sm text-dim hover:text-txt">
        <ArrowLeft aria-hidden className="size-4" /> All payroll
      </Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Payroll · {title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-dim">
            <span className="rounded-full border border-line-strong px-3 py-0.5 text-sm text-txt">{STATUS[run.status]}</span>
            {locked && (
              <span className="inline-flex items-center gap-1 text-sm">
                <Lock aria-hidden className="size-4" /> Locked
              </span>
            )}
            {run.status === "PAID" && run.paidAt && (
              <span className="text-sm">
                Paid {dateFormat.format(run.paidAt)} by {run.paidMethod.toLowerCase()}
                {run.reference ? ` · ref ${run.reference}` : ""}
              </span>
            )}
          </p>
        </div>
        <Button asChild variant="ghost" className="h-11 border border-line-strong">
          <a href={`/api/household/payroll/export?month=${month}`}>
            <Download aria-hidden className="size-4" /> Export to Excel
          </a>
        </Button>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        {[
          ["Gross", run.totalGross],
          ["Deductions", run.totalDeductions],
          ["Net to pay", run.totalNet],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex flex-col rounded-[1.5rem] border border-line bg-surface p-4">
            <dt className="text-sm text-dim">{String(label)}</dt>
            <dd className="order-first font-display text-xl font-semibold break-words sm:text-2xl">{formatPkr(value as never)}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="actions" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="actions" className="text-lg font-semibold">
          {run.status === "DRAFT" ? "When everything's right" : run.status === "APPROVED" ? "Record the payment" : "Paid"}
        </h2>
        <p className="mt-1 text-sm text-dim">
          {run.status === "DRAFT"
            ? "Approving locks this month. You can reopen it later if needed; that's logged. Or delete this draft to start the month again."
            : run.status === "APPROVED"
              ? "Marking it paid also records this month's advance repayments and creates the payslips."
              : "Reopening puts this month's advance repayments back to due and withdraws the payslips until it's paid again."}
          {run.status !== "DRAFT" && " To delete this payroll, reopen it first."}
        </p>
        <div className="mt-4">
          <RunActions runId={run.id} status={run.status} />
        </div>
        {run.status === "DRAFT" && (
          <div className="mt-4 border-t border-line pt-4">
            <RemoveButton path={`/api/household/payroll/${run.id}`} verb="Delete" label="this draft payroll" question="Delete this draft payroll? Any changes made to it are lost; advance repayments stay due." then="/household/payroll" />
          </div>
        )}
      </section>

      <ul className="mt-6 space-y-4">
        {run.lines.map((line) => {
          const allowances = (line.allowances as { name: string; amount: string }[]).map((a) => ({ label: a.name, amount: a.amount }));
          const earnings = line.earnings as Earning[];
          const deductions = line.deductions as Deduction[];
          return (
            <li key={line.id} className="rounded-[1.5rem] border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold break-words">{line.employee.fullName}</h3>
                  <p className="text-sm text-dim">{line.employee.role}</p>
                </div>
                <p className="text-right">
                  <span className="block font-display text-2xl font-semibold">{formatPkr(line.net)}</span>
                  <span className="text-sm text-dim">net pay</span>
                </p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Amounts title={`Earnings · ${formatPkr(line.gross)}`} rows={[{ label: "Basic salary", amount: line.basic.toFixed(2) }, ...allowances, ...earnings.map((e) => ({ label: e.label, amount: e.amount }))]} />
                <Amounts title={`Deductions · ${formatPkr(line.totalDeductions)}`} rows={deductions.map((d) => ({ label: d.label, amount: d.amount }))} />
              </div>
              {deductions.some((d) => d.kind === "ADVANCE") && !locked && (
                <p className="mt-2 text-sm text-dim">
                  To change or skip this month&apos;s advance repayment, use the{" "}
                  <Link href={`/household/advances?employeeId=${line.employeeId}`} className="underline">
                    Advances
                  </Link>{" "}
                  tab.
                </p>
              )}
              {line.net.lt(0) && <p className="mt-2 text-sm font-semibold">Deductions are more than the pay this month. Please adjust before approving.</p>}
              {!locked && (
                <PayrollLineEditor
                  lineId={line.id}
                  employeeName={line.employee.fullName}
                  initial={{
                    earnings: earnings.map((e) => ({ kind: e.kind, label: e.label, amount: e.amount })),
                    unpaidDays: line.unpaidDays.toString(),
                    otherDeductions: deductions.filter((d) => d.kind === "OTHER").map((d) => ({ label: d.label, amount: d.amount })),
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
      {!run.lines.length && <p className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5 text-dim">No employees in this payroll.</p>}

      {!locked && missing.length > 0 && (
        <section aria-label="Add an employee" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
          <AddLineForm runId={run.id} employees={missing} />
        </section>
      )}
    </>
  );
}
