"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

export const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";

type Values = { employerName: string; address: string; defaultPkrPerAed: string; payrollDay: number; expiryAlertDays: number; gratuityDaysPerYear: string };

export function SettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("Saving…");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/household/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(values) }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      setMessage("Settings saved.");
      router.refresh();
      return;
    }
    const body = await response?.json().catch(() => null);
    setMessage(body?.error ?? "Couldn't save the settings. Please try again.");
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <section aria-labelledby="employer" className="rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="employer" className="text-lg font-semibold">
          Employer details
        </h2>
        <p className="mt-1 text-sm text-dim">Shown at the top of every payslip.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Household or employer name
            <input className={FIELD} name="employerName" defaultValue={initial.employerName} required maxLength={120} />
          </label>
          <label className="block text-sm">
            Address
            <input className={FIELD} name="address" defaultValue={initial.address} maxLength={300} />
          </label>
        </div>
      </section>

      <section aria-labelledby="money" className="rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="money" className="text-lg font-semibold">
          Currency and payroll
        </h2>
        <p className="mt-1 text-sm text-dim">Amounts are in AED, with PKR for money sent home.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            Default rate (PKR per 1 AED)
            <input className={FIELD} name="defaultPkrPerAed" defaultValue={initial.defaultPkrPerAed} inputMode="decimal" required />
            <span className="mt-1 block text-xs text-dim">Pre-fills a transfer. You enter the actual rate each time.</span>
          </label>
          <label className="block text-sm">
            Payroll day of the month
            <input className={FIELD} name="payrollDay" type="number" min={1} max={28} defaultValue={initial.payrollDay} required />
          </label>
          <label className="block text-sm">
            Warn about documents expiring within (days)
            <input className={FIELD} name="expiryAlertDays" type="number" min={1} max={365} defaultValue={initial.expiryAlertDays} required />
          </label>
        </div>
      </section>

      <section aria-labelledby="gratuity" className="rounded-[1.5rem] border border-line bg-surface p-5">
        <h2 id="gratuity" className="text-lg font-semibold">
          End-of-service gratuity
        </h2>
        <p className="mt-1 text-sm text-dim">
          Used only for an estimate on each employee: this many days of basic pay for every completed year of service. It isn&apos;t legal advice; the actual
          amount depends on what you agreed with each employee.
        </p>
        <label className="mt-4 block max-w-xs text-sm">
          Days of basic pay per year
          <input className={FIELD} name="gratuityDaysPerYear" defaultValue={initial.gratuityDaysPerYear} inputMode="decimal" required />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-11 rounded-xl px-6" disabled={busy}>
          Save settings
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}
