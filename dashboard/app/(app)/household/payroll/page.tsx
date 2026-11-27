import { Download } from "lucide-react";
import Link from "next/link";
import { RunPayrollForm } from "@/components/household/PayrollForms";
import { RemoveButton } from "@/components/household/RemoveButton";
import { Button } from "@/components/ui/button";
import { formatPkr, monthOf } from "@/lib/household/money";
import { listRuns } from "@/lib/household/payroll";

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const STATUS_LABELS = { DRAFT: "Draft", APPROVED: "Approved", PAID: "Paid" } as const;

export default async function PayrollPage() {
  const runs = await listRuns();
  const thisMonth = monthOf(new Date());

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Payroll</h1>
          <p className="mt-2 text-dim">Monthly pay for your household staff, in PKR. Each month goes Draft → Approved → Paid, and is locked once approved.</p>
        </div>
        {runs.length > 0 && (
          <Button asChild variant="ghost" className="h-11 border border-line-strong">
            <a href="/api/household/payroll/export" download>
              <Download aria-hidden className="size-4" /> Export history
            </a>
          </Button>
        )}
      </div>

      <section aria-labelledby="run" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="run" className="text-lg font-semibold">
          Run payroll
        </h2>
        <p className="mt-1 text-sm text-dim">Every active employee is filled in with their basic and allowances, and that month&apos;s advance repayments are deducted.</p>
        <div className="mt-4">
          <RunPayrollForm defaultMonth={runs.some((r) => r.month === thisMonth) ? "" : thisMonth} />
        </div>
      </section>

      <section aria-labelledby="history" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="history" className="text-lg font-semibold">
          History
        </h2>
        {runs.length ? (
          <div className="relative mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Payroll history table">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-dim">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3 font-medium">Month</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Staff</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Gross</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Deductions</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Net</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Paid on</th>
                  <th scope="col" className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-line">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <Link href={`/household/payroll/${r.month}`} className="underline">
                        {monthFormat.format(new Date(`${r.month}-01T00:00:00Z`))}
                      </Link>
                    </th>
                    <td className="py-2 pr-3">{STATUS_LABELS[r.status]}</td>
                    <td className="py-2 pr-3 text-right font-mono">{r._count.lines}</td>
                    <td className="py-2 pr-3 text-right font-mono">{formatPkr(r.totalGross)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{formatPkr(r.totalDeductions)}</td>
                    <td className="py-2 pr-3 text-right font-mono font-semibold">{formatPkr(r.totalNet)}</td>
                    <td className="py-2 pr-3">{r.paidAt ? dateFormat.format(r.paidAt) : "–"}</td>
                    <td className="py-2">
                      {r.status === "DRAFT" && (
                        <RemoveButton
                          path={`/api/household/payroll/${r.id}`}
                          verb="Delete"
                          label={`${monthFormat.format(new Date(`${r.month}-01T00:00:00Z`))} payroll`}
                          question={`Delete the ${monthFormat.format(new Date(`${r.month}-01T00:00:00Z`))} draft payroll? Any changes made to it are lost; advance repayments stay due.`}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-dim">No payroll yet. Run your first month above.</p>
        )}
      </section>
    </>
  );
}
