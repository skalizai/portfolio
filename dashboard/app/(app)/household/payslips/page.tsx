import { Download, FileText, Printer, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { listEmployees } from "@/lib/household/employees";
import { formatPkr } from "@/lib/household/money";
import { type PayslipSnapshot, periodLabel } from "@/lib/household/payslip";

const FIELD = "h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";

export default async function PayslipsPage({ searchParams }: { searchParams: Promise<{ employeeId?: string; month?: string }> }) {
  const { employeeId = "", month = "" } = await searchParams;
  const employees = await listEmployees();
  const payslips = await db().payslip.findMany({
    where: { ...(employeeId ? { employeeId } : {}), ...(month ? { run: { month } } : {}) },
    include: { run: { select: { month: true } } },
    orderBy: [{ run: { month: "desc" } }, { employee: { fullName: "asc" } }],
  });
  const months = [...new Set(payslips.map((p) => p.run.month))];

  return (
    <>
      <h1 className="text-3xl font-semibold">Payslips</h1>
      <p className="mt-2 text-dim">One for each employee, made when a month&apos;s payroll is marked paid. Open one to print it, or download PDFs.</p>

      <form role="search" aria-label="Filter payslips" className="mt-6 grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
        <label className="block text-sm">
          <span className="sr-only">Employee</span>
          <select className={FIELD} name="employeeId" defaultValue={employeeId}>
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="sr-only">Month</span>
          <input className={FIELD} type="month" name="month" defaultValue={month} />
        </label>
        <Button type="submit" variant="ghost" className="h-11 border border-line-strong">
          <Search aria-hidden className="size-4" /> Filter
        </Button>
      </form>

      {months.length ? (
        <div className="mt-6 space-y-5">
          {months.map((m) => {
            const slips = payslips.filter((p) => p.run.month === m);
            return (
              <section key={m} aria-labelledby={`month-${m}`} className="rounded-[1.5rem] border border-line bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 id={`month-${m}`} className="text-lg font-semibold">
                    {periodLabel(m)}
                  </h2>
                  <Button asChild variant="ghost" className="h-11 border border-line-strong">
                    <a href={`/api/household/payslips/zip?month=${m}`} download>
                      <Download aria-hidden className="size-4" /> Download all ({slips.length}) as ZIP
                    </a>
                  </Button>
                </div>
                <ul className="mt-3 divide-y divide-line">
                  {slips.map((p) => {
                    const s = p.snapshot as PayslipSnapshot;
                    return (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="font-medium break-words">{s.employee.name}</p>
                          <p className="text-sm text-dim">
                            {s.employee.role} · net <span className="font-mono">{formatPkr(s.net)}</span>
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild variant="ghost" size="sm" className="border border-line-strong">
                            <Link href={`/household/payslips/${p.id}`}>
                              <Printer aria-hidden className="size-4" /> View and print <span className="sr-only">{s.employee.name}&apos;s payslip for {periodLabel(m)}</span>
                            </Link>
                          </Button>
                          <Button asChild variant="ghost" size="sm" className="border border-line-strong">
                            <a href={`/api/household/payslips/${p.id}?download`} download>
                              <FileText aria-hidden className="size-4" /> PDF <span className="sr-only">of {s.employee.name}&apos;s payslip for {periodLabel(m)}</span>
                            </a>
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <p className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5 text-dim">
          {employeeId || month ? "No payslips match these filters." : "No payslips yet. They appear here when you mark a month's payroll as paid."}
        </p>
      )}
    </>
  );
}
