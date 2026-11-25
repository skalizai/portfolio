import { Download, Plus, Search } from "lucide-react";
import Link from "next/link";
import { ExpiryAlerts } from "@/components/household/ExpiryAlerts";
import { Button } from "@/components/ui/button";
import { expiryAlerts, listEmployees, PAYMENT_LABELS, STATUS_LABELS } from "@/lib/household/employees";
import { formatPkr, mask, sum } from "@/lib/household/money";
import { getHouseholdSettings } from "@/lib/household/settings";

const FIELD = "h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "" } = await searchParams;
  const employees = await listEmployees({ q, status });
  const everyone = q || status ? await listEmployees() : employees;
  const settings = await getHouseholdSettings();
  const alerts = expiryAlerts(everyone, settings.expiryAlertDays);
  const exportQuery = new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) }).toString();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Employees</h1>
          <p className="mt-2 text-dim">Your household staff in Pakistan, paid in PKR. CNICs and IBANs are shortened here; open an employee to see them in full.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" className="h-11 border border-line-strong">
            <a href={`/api/household/employees/export${exportQuery ? `?${exportQuery}` : ""}`}>
              <Download aria-hidden className="size-4" /> Export to Excel
            </a>
          </Button>
          <Button asChild className="h-11">
            <Link href="/household/employees/new">
              <Plus aria-hidden className="size-4" /> Add employee
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <ExpiryAlerts alerts={alerts} windowDays={settings.expiryAlertDays} />
      </div>

      <form role="search" aria-label="Search employees" className="mt-6 grid gap-3 sm:grid-cols-[1fr_12rem_auto]">
        <label className="block text-sm">
          <span className="sr-only">Search by name, role, phone or CNIC</span>
          <input className={FIELD} type="search" name="q" defaultValue={q} placeholder="Search name, role, phone or CNIC" />
        </label>
        <label className="block text-sm">
          <span className="sr-only">Status</span>
          <select className={FIELD} name="status" defaultValue={status}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="LEFT">Left</option>
          </select>
        </label>
        <Button type="submit" variant="ghost" className="h-11 border border-line-strong">
          <Search aria-hidden className="size-4" /> Search
        </Button>
      </form>

      {employees.length ? (
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {employees.map((e) => {
            const monthly = sum([e.basicSalary, ...e.allowances.map((a) => a.amount)]);
            return (
              <li key={e.id}>
                <Link href={`/household/employees/${e.id}`} className="flex h-full gap-4 rounded-[1.5rem] border border-line bg-surface p-5 transition-colors hover:border-line-strong">
                  {e.photoFileId ? (
                    // Served behind sign-in, so it can't go through the image optimiser.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/household/files/${e.photoFileId}`} alt="" className="size-14 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span aria-hidden className="bg-gradient-accent flex size-14 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold text-on-accent">
                      {e.fullName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <span className="break-words">{e.fullName}</span>
                      <span className="rounded-full border border-line-strong px-2 py-0.5 text-xs font-normal">{STATUS_LABELS[e.status]}</span>
                    </p>
                    <p className="text-sm text-dim">
                      {e.role}
                      {e.nationality ? ` · ${e.nationality}` : ""}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <dt className="text-dim">Monthly pay</dt>
                      <dd className="font-mono">{formatPkr(monthly)}</dd>
                      <dt className="text-dim">Paid by</dt>
                      <dd>{PAYMENT_LABELS[e.paymentMethod]}</dd>
                      <dt className="text-dim">CNIC</dt>
                      <dd className="font-mono">{mask(e.cnicNo)}</dd>
                      <dt className="text-dim">Cantt Pass</dt>
                      <dd className="font-mono">{mask(e.canttPassNo)}</dd>
                    </dl>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5 text-dim">
          {q || status ? "No employees match that search." : "No employees yet. Add your household staff in Pakistan, such as a maid, driver or cook."}
        </p>
      )}
    </>
  );
}
