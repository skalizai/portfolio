import { Download, Search } from "lucide-react";
import { AdvanceForm, ChangeInstallment, DeleteAdvance } from "@/components/household/AdvanceForms";
import { Button } from "@/components/ui/button";
import { listAdvances, PLAN_LABELS } from "@/lib/household/advances";
import { listEmployees } from "@/lib/household/employees";
import { D, formatPkr, monthOf, sum } from "@/lib/household/money";

const FIELD = "h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const monthLabel = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));
const STATUS = { DUE: "Due", PAID: "Paid", SKIPPED: "Skipped" } as const;

export default async function AdvancesPage({ searchParams }: { searchParams: Promise<{ employeeId?: string; status?: string }> }) {
  const { employeeId = "", status = "" } = await searchParams;
  const employees = await listEmployees();
  const advances = await listAdvances({ employeeId: employeeId || undefined, status: status || undefined });

  // Totals per employee, across what the filters show.
  const perEmployee = new Map<string, { name: string; total: InstanceType<typeof D>; repaid: InstanceType<typeof D>; outstanding: InstanceType<typeof D> }>();
  for (const a of advances) {
    const entry = perEmployee.get(a.employeeId) ?? { name: a.employee.fullName, total: new D(0), repaid: new D(0), outstanding: new D(0) };
    perEmployee.set(a.employeeId, { ...entry, total: entry.total.plus(a.balance.total), repaid: entry.repaid.plus(a.balance.repaid), outstanding: entry.outstanding.plus(a.balance.outstanding) });
  }
  const query = new URLSearchParams({ ...(employeeId ? { employeeId } : {}), ...(status ? { status } : {}) }).toString();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Advances</h1>
          <p className="mt-2 text-dim">Salary advances and loans, in PKR. Each month&apos;s repayment is deducted in that month&apos;s payroll.</p>
        </div>
        <Button asChild variant="ghost" className="h-11 border border-line-strong">
          <a href={`/api/household/advances/export${query ? `?${query}` : ""}`}>
            <Download aria-hidden className="size-4" /> Export to Excel
          </a>
        </Button>
      </div>

      <section aria-labelledby="new-advance" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="new-advance" className="text-lg font-semibold">
          Record an advance
        </h2>
        <div className="mt-4">
          <AdvanceForm employees={employees.filter((e) => e.status !== "LEFT").map((e) => ({ id: e.id, name: e.fullName }))} defaultMonth={monthOf(new Date())} />
        </div>
      </section>

      {perEmployee.size > 0 && (
        <section aria-labelledby="balances" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
          <h2 id="balances" className="text-lg font-semibold">
            Balances by employee
          </h2>
          <div className="relative mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Balances by employee table">
            <table className="w-full min-w-[30rem] text-left text-sm">
              <thead className="text-dim">
                <tr className="border-b border-line">
                  <th scope="col" className="py-2 pr-3 font-medium">Employee</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Advanced</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Repaid</th>
                  <th scope="col" className="py-2 text-right font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {[...perEmployee.values()].map((row) => (
                  <tr key={row.name} className="border-b border-line">
                    <th scope="row" className="py-2 pr-3 font-normal">{row.name}</th>
                    <td className="py-2 pr-3 text-right font-mono">{formatPkr(row.total)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{formatPkr(row.repaid)}</td>
                    <td className="py-2 text-right font-mono font-semibold">{formatPkr(row.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <form role="search" aria-label="Filter advances" className="mt-6 grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
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
          <span className="sr-only">Status</span>
          <select className={FIELD} name="status" defaultValue={status}>
            <option value="">Open and closed</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
          </select>
        </label>
        <Button type="submit" variant="ghost" className="h-11 border border-line-strong">
          <Search aria-hidden className="size-4" /> Filter
        </Button>
      </form>

      {advances.length ? (
        <ul className="mt-6 space-y-4">
          {advances.map((a) => {
            const label = `${a.employee.fullName}'s advance of ${formatPkr(a.amount)} on ${dateFormat.format(a.date)}`;
            const repaidShare = a.balance.total.gt(0) ? Number(a.balance.repaid.dividedBy(a.balance.total).times(100).toFixed(0)) : 0;
            return (
              <li key={a.id} className="rounded-[1.5rem] border border-line bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold break-words">
                      {a.employee.fullName} · {formatPkr(a.amount)}
                    </h3>
                    <p className="text-sm text-dim">
                      {dateFormat.format(a.date)} · {PLAN_LABELS[a.plan]}
                      {a.reason ? ` · ${a.reason}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full border border-line-strong px-3 py-1 text-xs">{a.status === "OPEN" ? "Open" : "Closed"}</span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div className="flex flex-col">
                    <dt className="text-dim">Advanced</dt>
                    <dd className="order-first font-mono">{formatPkr(a.balance.total)}</dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="text-dim">Repaid</dt>
                    <dd className="order-first font-mono">{formatPkr(a.balance.repaid)}</dd>
                  </div>
                  <div className="flex flex-col">
                    <dt className="text-dim">Outstanding</dt>
                    <dd className="order-first font-mono font-semibold">{formatPkr(a.balance.outstanding)}</dd>
                  </div>
                </dl>
                <div className="mt-2 h-2 rounded-full bg-surface-2" role="progressbar" aria-label={`${repaidShare}% repaid`} aria-valuenow={repaidShare} aria-valuemin={0} aria-valuemax={100}>
                  <div className="bg-gradient-accent h-2 rounded-full" style={{ width: `${repaidShare}%` }} />
                </div>

                <h4 className="mt-4 text-sm font-semibold">Repayments</h4>
                <ul className="mt-2 divide-y divide-line text-sm">
                  {a.installments.map((i) => (
                    <li key={i.id} className="py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {monthLabel(i.month)} · <span className="font-mono">{formatPkr(i.amount)}</span> · {STATUS[i.status]}
                          {i.note ? <span className="text-dim"> · {i.note}</span> : null}
                        </span>
                        {i.status === "DUE" && <ChangeInstallment id={i.id} label={`${monthLabel(i.month)} repayment for ${a.employee.fullName}`} amount={i.amount.toFixed(0)} />}
                      </div>
                    </li>
                  ))}
                </ul>
                {!a.installments.some((i) => i.status === "PAID") && (
                  <div className="mt-3">
                    <DeleteAdvance id={a.id} label={label} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5 text-dim">{employeeId || status ? "No advances match these filters." : "No advances yet."}</p>
      )}
      <p className="sr-only">Total outstanding: {formatPkr(sum(advances.map((a) => a.balance.outstanding)))}</p>
    </>
  );
}
