"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { EmployeeFormValues } from "@/lib/household/employee-view";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";

const ROLES = ["Maid", "Driver", "Nanny", "Cook", "Gardener", "Housekeeper"];

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-[1.5rem] border border-line bg-surface p-5">
      <legend className="px-1 font-display text-lg font-semibold">{title}</legend>
      {hint && <p className="text-sm text-dim">{hint}</p>}
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`block text-sm ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`}>
      {label}
      {children}
    </label>
  );
}

/** Adds or edits an employee. Dates use the browser's date picker; money is typed as plain numbers. */
export function EmployeeForm({ employeeId, initial }: { employeeId?: string; initial: EmployeeFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));
  const input = (key: keyof EmployeeFormValues, extra: Record<string, unknown> = {}) => ({
    className: FIELD,
    name: key,
    value: values[key] as string | number,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
    ...extra,
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("Saving…");
    const response = await fetch(employeeId ? `/api/household/employees/${employeeId}` : "/api/household/employees", {
      method: employeeId ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, leaveDaysPerYear: Number(values.leaveDaysPerYear) }),
    }).catch(() => null);
    setBusy(false);
    const body = await response?.json().catch(() => null);
    if (!response?.ok) {
      setMessage(body?.error ?? "Couldn't save. Please try again.");
      return;
    }
    setMessage("Saved.");
    router.push(`/household/employees/${body.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate={false}>
      <Section title="Personal">
        <Field label="Full name">
          <input {...input("fullName")} required maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Role">
          <input {...input("role")} required maxLength={60} list="household-roles" placeholder="e.g. Maid" />
          <datalist id="household-roles">
            {ROLES.map((role) => (
              <option key={role} value={role} />
            ))}
          </datalist>
        </Field>
        <Field label="Nationality">
          <input {...input("nationality")} maxLength={60} />
        </Field>
        <Field label="Phone">
          <input {...input("phone")} type="tel" maxLength={40} />
        </Field>
        <Field label="Home-country contact" wide>
          <input {...input("homeContact")} maxLength={200} placeholder="Name, relationship and phone" />
        </Field>
      </Section>

      <Section title="Documents" hint="You'll be warned before any of these expire. Upload copies after saving.">
        <Field label="Passport number">
          <input {...input("passportNo")} maxLength={40} autoComplete="off" />
        </Field>
        <Field label="Passport expiry">
          <input {...input("passportExpiry")} type="date" />
        </Field>
        <Field label="Emirates ID number">
          <input {...input("emiratesIdNo")} maxLength={40} autoComplete="off" />
        </Field>
        <Field label="Emirates ID expiry">
          <input {...input("emiratesIdExpiry")} type="date" />
        </Field>
        <Field label="Visa or permit expiry">
          <input {...input("visaExpiry")} type="date" />
        </Field>
        <Field label="Medical insurance expiry">
          <input {...input("insuranceExpiry")} type="date" />
        </Field>
        <Field label="MOHRE / Tadbeer contract no. (optional)">
          <input {...input("contractNo")} maxLength={60} />
        </Field>
      </Section>

      <Section title="Employment">
        <Field label="Joining date">
          <input {...input("joiningDate")} type="date" required />
        </Field>
        <Field label="Contract start">
          <input {...input("contractStart")} type="date" />
        </Field>
        <Field label="Contract end">
          <input {...input("contractEnd")} type="date" />
        </Field>
        <Field label="Status">
          <select {...input("status")}>
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="LEFT">Left</option>
          </select>
        </Field>
        <Field label="Annual leave (days)">
          <input {...input("leaveDaysPerYear")} type="number" min={0} max={60} />
        </Field>
      </Section>

      <Section title="Pay" hint="In AED. Allowances are added to the basic salary in every payroll run.">
        <Field label="Basic monthly salary (AED)">
          <input {...input("basicSalary")} inputMode="decimal" required placeholder="e.g. 1500" />
        </Field>
        <div className="sm:col-span-2 lg:col-span-3">
          <p className="text-sm">Recurring allowances</p>
          <ul className="mt-2 space-y-2">
            {values.allowances.map((allowance, index) => (
              <li key={index} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
                <label className="block text-sm">
                  <span className="sr-only">Allowance {index + 1} name</span>
                  <input
                    className={FIELD}
                    value={allowance.name}
                    required
                    placeholder="e.g. Food"
                    list="household-allowances"
                    onChange={(e) => set("allowances", values.allowances.map((a, i) => (i === index ? { ...a, name: e.target.value } : a)))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="sr-only">Allowance {index + 1} amount in AED</span>
                  <input
                    className={FIELD}
                    value={allowance.amount}
                    required
                    inputMode="decimal"
                    placeholder="AED"
                    onChange={(e) => set("allowances", values.allowances.map((a, i) => (i === index ? { ...a, amount: e.target.value } : a)))}
                  />
                </label>
                <Button type="button" variant="ghost" className="h-11 w-11" aria-label={`Remove allowance ${allowance.name || index + 1}`} onClick={() => set("allowances", values.allowances.filter((_, i) => i !== index))}>
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <datalist id="household-allowances">
            {["Food", "Phone", "Transport", "Accommodation"].map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Button type="button" variant="ghost" className="mt-2 border border-line-strong" onClick={() => set("allowances", [...values.allowances, { name: "", amount: "" }])}>
            <Plus aria-hidden className="size-4" /> Add allowance
          </Button>
        </div>
        <Field label="Annual air ticket">
          <select className={FIELD} name="airTicket" value={values.airTicket ? "yes" : "no"} onChange={(e) => set("airTicket", e.target.value === "yes")}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
        {values.airTicket && (
          <Field label="Air ticket amount (AED)">
            <input {...input("airTicketAmount")} inputMode="decimal" />
          </Field>
        )}
      </Section>

      <Section title="Payment">
        <Field label="Payment method">
          <select {...input("paymentMethod")}>
            <option value="CASH">Cash</option>
            <option value="BANK_TRANSFER">Bank transfer</option>
            <option value="WPS">WPS</option>
            <option value="EXCHANGE_HOUSE">Exchange house</option>
          </select>
        </Field>
        <Field label="Bank (optional)">
          <input {...input("bankName")} maxLength={80} />
        </Field>
        <Field label="IBAN (optional)">
          <input {...input("iban")} maxLength={40} autoComplete="off" placeholder="AE07 0331 2345 6789 0123 456" />
        </Field>
      </Section>

      <fieldset className="rounded-[1.5rem] border border-line bg-surface p-5">
        <legend className="px-1 font-display text-lg font-semibold">Notes</legend>
        <label className="block text-sm">
          <span className="sr-only">Notes</span>
          <textarea className="mt-1 min-h-24 w-full rounded-xl border border-line-strong bg-bg p-3 text-sm text-txt" name="notes" value={values.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} />
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-11 rounded-xl px-6" disabled={busy}>
          {employeeId ? "Save changes" : "Add employee"}
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}
