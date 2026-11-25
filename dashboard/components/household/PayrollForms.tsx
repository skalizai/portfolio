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

export function RunPayrollForm({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const month = String(new FormData(event.currentTarget).get("month") ?? "");
    setBusy(true);
    setMessage("Preparing…");
    const error = await send("/api/household/payroll", "POST", { month });
    setBusy(false);
    if (error) {
      setMessage(error);
      return;
    }
    router.push(`/household/payroll/${month}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="block text-sm">
        Month
        <input className={FIELD} type="month" name="month" required defaultValue={defaultMonth} />
      </label>
      <Button type="submit" className="h-11" disabled={busy}>
        Run payroll
      </Button>
      <p role="status" className="basis-full text-sm">
        {message}
      </p>
    </form>
  );
}

export function RunActions({ runId, status }: { runId: string; status: "DRAFT" | "APPROVED" | "PAID" }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(action: string, body?: unknown) {
    setBusy(true);
    setMessage("Saving…");
    const error = await send(`/api/household/payroll/${runId}/${action}`, "POST", body ?? {});
    setBusy(false);
    setMessage(error ?? "");
    if (!error) router.refresh();
  }

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await act("pay", Object.fromEntries(new FormData(event.currentTarget).entries()));
  }

  function reopen() {
    const reason = window.prompt("Why are you reopening this payroll? This is kept in the log.");
    if (reason === null) return;
    void act("reopen", { reason });
  }

  return (
    <div className="space-y-3">
      {status === "DRAFT" && (
        <Button type="button" className="h-11" disabled={busy} onClick={() => act("approve")}>
          Approve payroll
        </Button>
      )}
      {status === "APPROVED" && (
        <form onSubmit={pay} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="block text-sm">
            Paid on
            <input className={FIELD} type="date" name="paidAt" required defaultValue={new Date().toISOString().slice(0, 10)} />
          </label>
          <label className="block text-sm">
            Paid by
            <select className={FIELD} name="method" defaultValue="Cash">
              <option>Cash</option>
              <option>Bank transfer</option>
              <option>Mixed</option>
            </select>
          </label>
          <label className="block text-sm">
            Reference <span className="text-dim">(optional)</span>
            <input className={FIELD} name="reference" maxLength={100} />
          </label>
          <Button type="submit" className="h-11" disabled={busy}>
            Mark as paid
          </Button>
        </form>
      )}
      {status !== "DRAFT" && (
        <Button type="button" variant="ghost" className={`h-11 ${OUTLINE}`} disabled={busy} onClick={reopen}>
          Reopen to make changes
        </Button>
      )}
      <p role="status" className="min-h-5 text-sm">
        {message}
      </p>
    </div>
  );
}

type Row = { kind?: string; label: string; amount: string };

export function PayrollLineEditor({
  lineId,
  employeeName,
  initial,
}: {
  lineId: string;
  employeeName: string;
  initial: { earnings: Row[]; unpaidDays: string; otherDeductions: Row[] };
}) {
  const router = useRouter();
  const [earnings, setEarnings] = useState(initial.earnings);
  const [unpaidDays, setUnpaidDays] = useState(initial.unpaidDays);
  const [others, setOthers] = useState(initial.otherDeductions);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("Saving…");
    const error = await send(`/api/household/payroll/lines/${lineId}`, "PUT", {
      earnings: earnings.map((e) => ({ kind: e.kind ?? "OTHER", label: e.label, amount: e.amount })),
      unpaidDays: unpaidDays || "0",
      otherDeductions: others.map((d) => ({ label: d.label, amount: d.amount })),
    });
    setBusy(false);
    setMessage(error ?? "Saved.");
    if (!error) router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Take ${employeeName} out of this month's payroll?`)) return;
    const error = await send(`/api/household/payroll/lines/${lineId}`, "DELETE");
    setMessage(error ?? "");
    if (!error) router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-4 border-t border-line pt-4">
      <fieldset>
        <legend className="text-sm font-semibold">Extra earnings this month</legend>
        <ul className="mt-2 space-y-2">
          {earnings.map((row, index) => (
            <li key={index} className="grid grid-cols-[8rem_1fr_7rem_auto] items-end gap-2">
              <label className="block text-sm">
                <span className="sr-only">Earning {index + 1} type for {employeeName}</span>
                <select
                  className={FIELD}
                  value={row.kind ?? "OTHER"}
                  onChange={(e) => {
                    const kind = e.target.value;
                    const defaults: Record<string, string> = { OVERTIME: "Overtime", BONUS: "Bonus", EID_GIFT: "Eid gift", OTHER: "" };
                    setEarnings(earnings.map((r, i) => (i === index ? { ...r, kind, label: r.label && !Object.values(defaults).includes(r.label) ? r.label : defaults[kind]! } : r)));
                  }}
                >
                  <option value="OVERTIME">Overtime</option>
                  <option value="BONUS">Bonus</option>
                  <option value="EID_GIFT">Eid gift</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="sr-only">Earning {index + 1} description for {employeeName}</span>
                <input className={FIELD} value={row.label} required maxLength={80} onChange={(e) => setEarnings(earnings.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)))} />
              </label>
              <label className="block text-sm">
                <span className="sr-only">Earning {index + 1} amount in PKR for {employeeName}</span>
                <input className={FIELD} value={row.amount} required inputMode="decimal" placeholder="PKR" onChange={(e) => setEarnings(earnings.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r)))} />
              </label>
              <Button type="button" variant="ghost" className="h-11 w-11" aria-label={`Remove earning ${index + 1} for ${employeeName}`} onClick={() => setEarnings(earnings.filter((_, i) => i !== index))}>
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" className={`mt-2 ${OUTLINE}`} onClick={() => setEarnings([...earnings, { kind: "BONUS", label: "Bonus", amount: "" }])}>
          <Plus aria-hidden className="size-4" /> Add earning <span className="sr-only">for {employeeName}</span>
        </Button>
      </fieldset>

      <label className="block max-w-xs text-sm">
        Unpaid leave days <span className="sr-only">for {employeeName}</span>
        <input className={FIELD} value={unpaidDays} inputMode="decimal" onChange={(e) => setUnpaidDays(e.target.value)} />
        <span className="mt-1 block text-xs text-dim">Deducted at basic ÷ 30 a day. Half days are allowed.</span>
      </label>

      <fieldset>
        <legend className="text-sm font-semibold">Other deductions</legend>
        <ul className="mt-2 space-y-2">
          {others.map((row, index) => (
            <li key={index} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2">
              <label className="block text-sm">
                <span className="sr-only">Deduction {index + 1} description for {employeeName}</span>
                <input className={FIELD} value={row.label} required maxLength={80} placeholder="e.g. Phone bill" onChange={(e) => setOthers(others.map((r, i) => (i === index ? { ...r, label: e.target.value } : r)))} />
              </label>
              <label className="block text-sm">
                <span className="sr-only">Deduction {index + 1} amount in PKR for {employeeName}</span>
                <input className={FIELD} value={row.amount} required inputMode="decimal" placeholder="PKR" onChange={(e) => setOthers(others.map((r, i) => (i === index ? { ...r, amount: e.target.value } : r)))} />
              </label>
              <Button type="button" variant="ghost" className="h-11 w-11" aria-label={`Remove deduction ${index + 1} for ${employeeName}`} onClick={() => setOthers(others.filter((_, i) => i !== index))}>
                <Trash2 aria-hidden className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" className={`mt-2 ${OUTLINE}`} onClick={() => setOthers([...others, { label: "", amount: "" }])}>
          <Plus aria-hidden className="size-4" /> Add deduction <span className="sr-only">for {employeeName}</span>
        </Button>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-11" disabled={busy}>
          Save <span className="sr-only">{employeeName}&apos;s pay</span>
        </Button>
        <Button type="button" variant="ghost" className={`h-11 ${OUTLINE}`} onClick={remove}>
          Remove <span className="sr-only">{employeeName}</span> from this payroll
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}

export function AddLineForm({ runId, employees }: { runId: string; employees: { id: string; name: string }[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  if (!employees.length) return null;
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const employeeId = String(new FormData(event.currentTarget).get("employeeId") ?? "");
        const error = await send(`/api/household/payroll/${runId}/lines`, "POST", { employeeId });
        setMessage(error ?? "");
        if (!error) router.refresh();
      }}
    >
      <label className="block text-sm">
        Add someone not included
        <select className={FIELD} name="employeeId">
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="ghost" className={`h-11 ${OUTLINE}`}>
        <Plus aria-hidden className="size-4" /> Add to payroll
      </Button>
      {message && (
        <p role="status" className="basis-full text-sm">
          {message}
        </p>
      )}
    </form>
  );
}
