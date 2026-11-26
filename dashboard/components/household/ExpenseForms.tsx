"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";
const FILE = "mt-1 block w-full text-sm file:mr-3 file:h-11 file:rounded-xl file:border file:border-line-strong file:bg-surface-2 file:px-3 file:text-txt";
const OUTLINE = "border border-line-strong";

async function sendJson(path: string, method: string, body?: unknown): Promise<string | null> {
  const response = await fetch(path, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }).catch(() => null);
  if (response?.ok) return null;
  const data = await response?.json().catch(() => null);
  return data?.error ?? "Couldn't save that. Please try again.";
}

type Category = { id: string; name: string };

export type ExpenseValues = { date: string; categoryId: string; amount: string; currency: "AED" | "PKR"; rate: string; paymentMethod: string; notes: string; status: "PENDING" | "CONFIRMED" };

/** Adds or edits an expense. A PKR amount is converted to AED at the rate shown. */
export function ExpenseForm({ categories, initial, id }: { categories: Category[]; initial: ExpenseValues; id?: string }) {
  const router = useRouter();
  const [currency, setCurrency] = useState(initial.currency);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setMessage("Saving…");
    const response = await fetch(id ? `/api/household/expenses/${id}` : "/api/household/expenses", { method: id ? "PUT" : "POST", body: new FormData(form) }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const body = await response?.json().catch(() => null);
      setMessage(body?.error ?? "Couldn't save that. Please try again.");
      return;
    }
    if (id) {
      router.push("/household/expenses");
      router.refresh();
      return;
    }
    setMessage("Expense added.");
    form.reset();
    setCurrency(initial.currency);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          Date
          <input className={FIELD} type="date" name="date" required defaultValue={initial.date} />
        </label>
        <label className="block text-sm">
          Category
          <select className={FIELD} name="categoryId" required defaultValue={initial.categoryId}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <label className="block text-sm">
            Amount
            <input className={FIELD} name="amount" inputMode="decimal" required placeholder="e.g. 250" defaultValue={initial.amount} />
          </label>
          <label className="block text-sm">
            Currency
            <select className={FIELD} name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as "AED" | "PKR")}>
              <option value="AED">AED</option>
              <option value="PKR">PKR</option>
            </select>
          </label>
        </div>
        {currency === "PKR" && (
          <label className="block text-sm">
            Rate (PKR per 1 AED)
            <input className={FIELD} name="rate" inputMode="decimal" required defaultValue={initial.rate} />
          </label>
        )}
        <label className="block text-sm">
          Paid by
          <input className={FIELD} name="paymentMethod" maxLength={60} placeholder="e.g. Card, cash" defaultValue={initial.paymentMethod} />
        </label>
        <label className="block text-sm">
          Status
          <select className={FIELD} name="status" defaultValue={initial.status}>
            <option value="CONFIRMED">Confirmed</option>
            <option value="PENDING">To confirm</option>
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
          {id ? "Save changes" : "Add expense"}
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}

export function ConfirmExpense({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      size="sm"
      onClick={async () => {
        const error = await sendJson(`/api/household/expenses/${id}`, "PATCH");
        if (error) window.alert(error);
        else router.refresh();
      }}
    >
      <Check aria-hidden className="size-4" /> Confirm <span className="sr-only">{label}</span>
    </Button>
  );
}

/** One category's name, monthly budget and whether it's in use, edited in place; or a new one. */
export function CategoryForm({ id, initial }: { id?: string; initial: { name: string; monthlyBudgetAed: string; isActive: boolean } }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const error = await sendJson(id ? `/api/household/expense-categories/${id}` : "/api/household/expense-categories", id ? "PUT" : "POST", {
      name: data.get("name"),
      monthlyBudgetAed: data.get("monthlyBudgetAed"),
      isActive: id ? data.get("isActive") === "on" : true,
    });
    setMessage(error ?? "Saved.");
    if (!error) {
      if (!id) form.reset();
      router.refresh();
    }
  }

  const name = initial.name || "new category";
  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto_auto] sm:items-end">
      <label className="block text-sm">
        <span className={id ? "sr-only" : ""}>Name</span>
        <input className={FIELD} name="name" required maxLength={60} defaultValue={initial.name} aria-label={id ? `Name of ${name}` : undefined} />
      </label>
      <label className="block text-sm">
        <span className={id ? "sr-only" : ""}>Monthly budget (AED)</span>
        <input className={FIELD} name="monthlyBudgetAed" inputMode="decimal" placeholder="No budget" defaultValue={initial.monthlyBudgetAed} aria-label={id ? `Monthly budget for ${name} in AED` : undefined} />
      </label>
      {id ? (
        <label className="flex h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={initial.isActive} className="size-4" /> In use
        </label>
      ) : (
        <span />
      )}
      <Button type="submit" variant={id ? "ghost" : "primary"} className={`h-11 ${id ? OUTLINE : ""}`}>
        {id ? "Save" : "Add category"} <span className="sr-only">{name}</span>
      </Button>
      {message && (
        <p role="status" className="text-sm sm:col-span-4">
          {message}
        </p>
      )}
    </form>
  );
}

export function RecurringForm({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const error = await sendJson("/api/household/recurring", "POST", Object.fromEntries(new FormData(form).entries()));
    setMessage(error ?? "Added. Each month it appears in the list as “to confirm” on its day.");
    if (!error) {
      form.reset();
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block text-sm">
          Name
          <input className={FIELD} name="name" required maxLength={80} placeholder="e.g. Rent" />
        </label>
        <label className="block text-sm">
          Category
          <select className={FIELD} name="categoryId" required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Amount
          <input className={FIELD} name="amount" inputMode="decimal" required />
        </label>
        <label className="block text-sm">
          Currency
          <select className={FIELD} name="currency" defaultValue="AED">
            <option value="AED">AED</option>
            <option value="PKR">PKR</option>
          </select>
        </label>
        <label className="block text-sm">
          Day of the month
          <input className={FIELD} name="dayOfMonth" type="number" min={1} max={28} required defaultValue={1} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" className="h-11">
          Add monthly expense
        </Button>
        <p role="status" className="text-sm">
          {message}
        </p>
      </div>
    </form>
  );
}

export function RecurringToggle({ id, isActive, label }: { id: string; isActive: boolean; label: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={OUTLINE}
      onClick={async () => {
        const error = await sendJson(`/api/household/recurring/${id}`, "PATCH", { isActive: !isActive });
        if (error) window.alert(error);
        else router.refresh();
      }}
    >
      {isActive ? "Pause" : "Resume"} <span className="sr-only">{label}</span>
    </Button>
  );
}
