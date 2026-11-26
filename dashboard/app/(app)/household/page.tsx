import Link from "next/link";
import { ExpiryAlerts } from "@/components/household/ExpiryAlerts";
import { OutflowChart, ShareBar } from "@/components/household/HouseholdCharts";
import { Button } from "@/components/ui/button";
import { addMonths, formatAed, formatPkr, isMonth, monthOf } from "@/lib/household/money";
import { getOverview } from "@/lib/household/overview";

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const RUN_STATUS = { DRAFT: "Draft, not yet approved", APPROVED: "Approved, not yet paid", PAID: "Paid" } as const;

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col rounded-[1.25rem] border border-line bg-surface p-4">
      <dt className="text-sm text-dim">{label}</dt>
      <dd className="order-first font-mono text-lg font-semibold break-words">{value}</dd>
      {detail && <dd className="text-xs text-dim">{detail}</dd>}
    </div>
  );
}

export default async function HouseholdOverviewPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const requested = (await searchParams).month;
  const month = requested && isMonth(requested) ? requested : monthOf(new Date());
  const o = await getOverview(month);
  const k = o.kpis;
  const rate = `${o.rate.toString()} PKR/AED`;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Household &amp; Family</h1>
          <p className="mt-2 text-dim">Payroll, money sent home and expenses. Payroll counts once it&apos;s marked paid, and is shown in AED at your default rate of {rate}.</p>
        </div>
        <form className="flex items-end gap-2" aria-label="Choose a month">
          <label className="block text-sm">
            Month
            <input className="mt-1 h-11 rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt" type="month" name="month" defaultValue={month} />
          </label>
          <Button type="submit" variant="ghost" className="h-11 border border-line-strong">
            Show
          </Button>
        </form>
      </div>
      <nav aria-label="Previous and next month" className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href={`/household?month=${addMonths(month, -1)}`} className="rounded-full border border-line px-3 py-1.5 text-dim hover:text-txt">
          ← {monthLabel(addMonths(month, -1))}
        </Link>
        <Link href={`/household?month=${addMonths(month, 1)}`} className="rounded-full border border-line px-3 py-1.5 text-dim hover:text-txt">
          {monthLabel(addMonths(month, 1))} →
        </Link>
      </nav>

      <h2 className="mt-6 text-lg font-semibold">{monthLabel(month)}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Payroll paid" value={formatPkr(k.payrollMonthPkr)} detail={`≈ ${formatAed(k.payrollMonthAed)}`} />
        <Kpi label="Sent home" value={formatAed(k.sentMonth.aed)} detail={`${formatPkr(k.sentMonth.pkr)} received`} />
        <Kpi label="Sent to wife" value={formatAed(k.toWifeMonth.aed)} detail={formatPkr(k.toWifeMonth.pkr)} />
        <Kpi label="Other expenses" value={formatAed(k.spentMonth)} />
        <Kpi label="Total outflow" value={formatAed(k.outflowMonth)} detail="Payroll, transfers with fees, and expenses" />
        <Kpi label="Advances outstanding" value={formatPkr(k.outstanding)} detail="Still to be repaid, today" />
        <Kpi label={`Total outflow, ${o.year} to date`} value={formatAed(k.outflowYtd)} />
        <Kpi label={`Sent home, ${o.year} to date`} value={formatAed(k.sentYtd.aed)} detail={`${formatPkr(k.sentYtd.pkr)} received`} />
      </dl>

      <section className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
        <OutflowChart months={o.chart} selected={month} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ShareBar title={`Sent home by recipient, ${o.year} to date`} slices={o.byRecipient} empty="No transfers yet this year." />
        <ShareBar title={`Sent home by purpose, ${o.year} to date`} slices={o.byPurpose} empty="No transfers yet this year." />
        <ShareBar title={`Expenses by category, ${o.year} to date`} slices={o.byCategory} empty="No expenses yet this year." />
      </div>

      {o.expiries.length > 0 && (
        <div className="mt-6">
          <ExpiryAlerts alerts={o.expiries} windowDays={o.alertDays} />
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="payroll-status" className="rounded-[1.5rem] border border-line bg-surface p-5">
          <h2 id="payroll-status" className="font-semibold">
            Payroll for {monthLabel(month)}
          </h2>
          <p className="mt-2 text-sm">{o.monthRun ? `${RUN_STATUS[o.monthRun.status]} · net ${formatPkr(o.monthRun.totalNet)}` : `Not started. ${o.staff} ${o.staff === 1 ? "employee" : "employees"} on staff.`}</p>
          <Link href={o.monthRun ? `/household/payroll/${month}` : "/household/payroll"} className="mt-3 inline-block text-sm underline">
            {o.monthRun ? "Open payroll" : "Run payroll"}
          </Link>
        </section>

        <section aria-labelledby="open-advances" className="rounded-[1.5rem] border border-line bg-surface p-5">
          <h2 id="open-advances" className="font-semibold">
            Open advances
          </h2>
          {o.advances.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {o.advances.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span className="min-w-0 break-words">{a.employee.fullName}</span>
                  <span className="font-mono">{formatPkr(a.balance.outstanding)} left</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-dim">None.</p>
          )}
          <Link href="/household/advances" className="mt-3 inline-block text-sm underline">
            All advances
          </Link>
        </section>

        <section aria-labelledby="recent-transfers" className="rounded-[1.5rem] border border-line bg-surface p-5">
          <h2 id="recent-transfers" className="font-semibold">
            Recent transfers
          </h2>
          {o.recentTransfers.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {o.recentTransfers.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <span className="min-w-0 break-words">
                    {dateFormat.format(r.date)} · {r.recipient.name}
                  </span>
                  <span className="font-mono">{formatAed(r.amountAed)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-dim">None yet.</p>
          )}
          <Link href="/household/remittances" className="mt-3 inline-block text-sm underline">
            All transfers
          </Link>
        </section>
      </div>
    </>
  );
}
