"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";
const FILE = "mt-1 block w-full text-sm file:mr-3 file:h-11 file:rounded-xl file:border file:border-line-strong file:bg-surface-2 file:px-3 file:text-txt";

const PURPOSES = [
  ["HOUSEHOLD", "Household"],
  ["SCHOOL_FEES", "School fees"],
  ["MEDICAL", "Medical"],
  ["CONSTRUCTION", "Construction"],
  ["SAVINGS", "Savings"],
  ["OTHER", "Other"],
] as const;
const RELATIONSHIPS = [
  ["WIFE", "Wife"],
  ["MOTHER", "Mother"],
  ["FATHER", "Father"],
  ["SIBLING", "Brother or sister"],
  ["OTHER", "Other"],
] as const;

export type RemittanceValues = {
  date: string;
  recipientId: string;
  amountAed: string;
  rate: string;
  amountPkr: string;
  feeAed: string;
  channel: string;
  reference: string;
  purpose: string;
  notes: string;
};

const pkr = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 2, minimumFractionDigits: 0 });

/** Records or edits a transfer. PKR received is worked out from the rate unless you type what arrived. */
export function RemittanceForm({ recipients, initial, id }: { recipients: { id: string; name: string }[]; initial: RemittanceValues; id?: string }) {
  const router = useRouter();
  const [aed, setAed] = useState(initial.amountAed);
  const [rate, setRate] = useState(initial.rate);
  const [received, setReceived] = useState(initial.amountPkr);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const worked = Number(aed) > 0 && Number(rate) > 0 ? Math.round(Number(aed) * Number(rate) * 100) / 100 : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage("Saving…");
    const response = await fetch(id ? `/api/household/remittances/${id}` : "/api/household/remittances", { method: id ? "PUT" : "POST", body: new FormData(form) }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      setMessage(body?.error ?? "Couldn't save that. Please try again.");
      return;
    }
    if (id) {
      router.push("/household/remittances");
      return;
    }
    setMessage("Transfer recorded.");
    form.reset();
    setAed("");
    setReceived("");
    router.refresh();
  }

  if (!recipients.length) return <p className="text-sm text-dim">Add a recipient first.</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          Date
          <input className={FIELD} type="date" name="date" required defaultValue={initial.date} />
        </label>
        <label className="block text-sm">
          Sent to
          <select className={FIELD} name="recipientId" required defaultValue={initial.recipientId}>
            {recipients.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Sent (AED)
          <input className={FIELD} name="amountAed" inputMode="decimal" required placeholder="e.g. 2000" value={aed} onChange={(e) => setAed(e.target.value)} />
        </label>
        <label className="block text-sm">
          Rate (PKR per 1 AED)
          <input className={FIELD} name="rate" inputMode="decimal" required value={rate} onChange={(e) => setRate(e.target.value)} />
        </label>
        <label className="block text-sm">
          Received (PKR)
          <input className={FIELD} name="amountPkr" inputMode="decimal" placeholder={worked ? String(worked) : "Worked out from the rate"} value={received} onChange={(e) => setReceived(e.target.value)} aria-describedby="pkr-hint" />
          <span id="pkr-hint" className="mt-1 block text-xs text-dim">
            {received ? "As entered." : worked ? `${pkr.format(worked)} at this rate. Type a figure if a different amount arrived.` : "Worked out from the rate."}
          </span>
        </label>
        <label className="block text-sm">
          Fee (AED)
          <input className={FIELD} name="feeAed" inputMode="decimal" placeholder="0" defaultValue={initial.feeAed} />
        </label>
        <label className="block text-sm">
          Channel
          <input className={FIELD} name="channel" maxLength={80} placeholder="e.g. Al Ansari, bank app" defaultValue={initial.channel} />
        </label>
        <label className="block text-sm">
          Reference
          <input className={FIELD} name="reference" maxLength={120} defaultValue={initial.reference} />
        </label>
        <label className="block text-sm">
          Purpose
          <select className={FIELD} name="purpose" defaultValue={initial.purpose}>
            {PURPOSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          Notes
          <input className={FIELD} name="notes" maxLength={500} defaultValue={initial.notes} />
        </label>
        <label className="block text-sm">
          Receipt {id ? "(replaces the current one)" : "(optional)"}
          <input className={FILE} type="file" name="receipt" accept="application/pdf,image/jpeg,image/png,image/webp" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-11 rounded-xl px-6" disabled={busy}>
          {id ? "Save changes" : "Record transfer"}
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}

export type RecipientValues = { name: string; relationship: string; phone: string; account: string; wallet: string; city: string; notes: string; monthlyTargetAed: string };

/** Adds a recipient, or edits one when `id` is given (shown behind an Edit button). */
export function RecipientForm({ id, initial, label }: { id?: string; initial: RecipientValues; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(!id);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const response = await fetch(id ? `/api/household/recipients/${id}` : "/api/household/recipients", {
      method: id ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    }).catch(() => null);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      setMessage(body?.error ?? "Couldn't save that. Please try again.");
      return;
    }
    setMessage(id ? "" : "Recipient added.");
    if (id) setOpen(false);
    else form.reset();
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" className="border border-line-strong" onClick={() => setOpen(true)}>
        Edit <span className="sr-only">{label}</span>
      </Button>
    );
  }
  return (
    <form onSubmit={submit} className="w-full space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          Name
          <input className={FIELD} name="name" required maxLength={120} defaultValue={initial.name} />
        </label>
        <label className="block text-sm">
          Relationship
          <select className={FIELD} name="relationship" defaultValue={initial.relationship}>
            {RELATIONSHIPS.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Monthly target (AED, optional)
          <input className={FIELD} name="monthlyTargetAed" inputMode="decimal" defaultValue={initial.monthlyTargetAed} />
        </label>
        <label className="block text-sm">
          Phone
          <input className={FIELD} name="phone" type="tel" maxLength={40} defaultValue={initial.phone} />
        </label>
        <label className="block text-sm">
          Bank account or IBAN
          <input className={FIELD} name="account" maxLength={80} defaultValue={initial.account} />
        </label>
        <label className="block text-sm">
          Wallet (JazzCash, Easypaisa)
          <input className={FIELD} name="wallet" maxLength={80} defaultValue={initial.wallet} />
        </label>
        <label className="block text-sm">
          City
          <input className={FIELD} name="city" maxLength={80} defaultValue={initial.city} />
        </label>
        <label className="block text-sm">
          Notes
          <input className={FIELD} name="notes" maxLength={500} defaultValue={initial.notes} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" className="h-11">
          {id ? "Save" : "Add recipient"} {label && <span className="sr-only">{label}</span>}
        </Button>
        {id && (
          <Button type="button" variant="ghost" className="h-11 border border-line-strong" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        )}
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}
