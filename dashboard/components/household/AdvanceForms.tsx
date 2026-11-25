"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";
const OUTLINE = "border border-line-strong";

async function send(path: string, method: string, body?: unknown): Promise<string | null> {
  const response = await fetch(path, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }).catch(() => null);
  if (response?.ok) return null;
  const data = await response?.json().catch(() => null);
  return data?.error ?? "Couldn't save that. Please try again.";
}

export function AdvanceForm({ employees, defaultMonth }: { employees: { id: string; name: string }[]; defaultMonth: string }) {
  const router = useRouter();
  const [plan, setPlan] = useState<"ONE_TIME" | "FIXED_MONTHLY" | "CUSTOM">("ONE_TIME");
  const [rows, setRows] = useState([{ month: defaultMonth, amount: "" }]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries([...new FormData(form).entries()].filter(([key, v]) => !key.startsWith("row-") && String(v).trim() !== ""));
    setBusy(true);
    setMessage("Saving…");
    const error = await send("/api/household/advances", "POST", { ...values, plan, ...(plan === "CUSTOM" ? { schedule: rows } : {}) });
    setBusy(false);
    setMessage(error ?? "Advance recorded.");
    if (!error) {
      form.reset();
      setPlan("ONE_TIME");
      setRows([{ month: defaultMonth, amount: "" }]);
      router.refresh();
    }
  }

  if (!employees.length) return <p className="text-sm text-dim">Add an employee first.</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          Employee
          <select className={FIELD} name="employeeId" required>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Date given
          <input className={FIELD} type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="block text-sm">
          Amount (PKR)
          <input className={FIELD} name="amount" inputMode="decimal" required placeholder="e.g. 20000" />
        </label>
        <label className="block text-sm">
          Reason
          <input className={FIELD} name="reason" maxLength={300} placeholder="e.g. Medical" />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm">Repayment plan</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["ONE_TIME", "One payment, next payroll"],
              ["FIXED_MONTHLY", "Fixed monthly installment"],
              ["CUSTOM", "Custom schedule"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={`flex h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm ${plan === value ? "border-line-strong bg-surface-2" : "border-line text-dim"}`}>
              <input type="radio" name="planChoice" value={value} checked={plan === value} onChange={() => setPlan(value)} className="size-4" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {plan === "FIXED_MONTHLY" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            Repaid each month (PKR)
            <input className={FIELD} name="perMonth" inputMode="decimal" required placeholder="e.g. 5000" />
          </label>
          <label className="block text-sm">
            First month <span className="text-dim">(optional)</span>
            <input className={FIELD} type="month" name="startMonth" />
          </label>
        </div>
      )}

      {plan === "CUSTOM" && (
        <div>
          <p className="text-sm text-dim">The months must add up to the advance.</p>
          <ul className="mt-2 space-y-2">
            {rows.map((row, index) => (
              <li key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:max-w-xl">
                <label className="block text-sm">
                  <span className="sr-only">Month {index + 1}</span>
                  <input className={FIELD} type="month" name={`row-month-${index}`} required value={row.month} onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, month: e.target.value } : r)))} />
                </label>
                <label className="block text-sm">
                  <span className="sr-only">Amount for month {index + 1} in PKR</span>
                  <input className={FIELD} name={`row-amount-${index}`} inputMode="decimal" required placeholder="PKR" value={row.amount} onChange={(e) => setRows(rows.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r)))} />
                </label>
                <Button type="button" variant="ghost" className="h-11 w-11" aria-label={`Remove month ${index + 1}`} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, i) => i !== index))}>
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="ghost" className={`mt-2 ${OUTLINE}`} onClick={() => setRows([...rows, { month: "", amount: "" }])}>
            <Plus aria-hidden className="size-4" /> Add month
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-11 rounded-xl px-6" disabled={busy}>
          Record advance
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}

/** Changes or skips one month's repayment, with a note. The difference moves to the end. */
export function ChangeInstallment({ id, label, amount }: { id: string; label: string; amount: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const error = await send(`/api/household/installments/${id}`, "PATCH", values);
    setMessage(error ?? "");
    if (!error) {
      setOpen(false);
      router.refresh();
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className={OUTLINE} onClick={() => setOpen(true)}>
        Change <span className="sr-only">{label}</span>
      </Button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr_auto_auto] sm:items-end">
      <label className="block text-sm">
        Amount (0 skips)
        <input className={FIELD} name="amount" inputMode="decimal" defaultValue={amount} required />
      </label>
      <label className="block text-sm">
        Note
        <input className={FIELD} name="note" maxLength={300} placeholder="e.g. Eid month" />
      </label>
      <Button type="submit" className="h-11">
        Save <span className="sr-only">{label}</span>
      </Button>
      <Button type="button" variant="ghost" className={`h-11 ${OUTLINE}`} onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {message && (
        <p role="status" className="text-sm sm:col-span-4">
          {message}
        </p>
      )}
    </form>
  );
}

export function DeleteAdvance({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={OUTLINE}
        onClick={async () => {
          if (!window.confirm(`Remove ${label}?`)) return;
          const error = await send(`/api/household/advances/${id}`, "DELETE");
          setMessage(error ?? "");
          if (!error) router.refresh();
        }}
      >
        <Trash2 aria-hidden className="size-4" /> Remove <span className="sr-only">{label}</span>
      </Button>
      {message && (
        <p role="status" className="mt-1 text-sm">
          {message}
        </p>
      )}
    </div>
  );
}
