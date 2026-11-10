"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

const FIELD = "mt-1 h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";
const OUTLINE = "border border-line-strong";

async function send(path: string, method: string, body?: unknown): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(path, {
    method,
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  }).catch(() => null);
  if (response?.ok) return { ok: true };
  const data = await response?.json().catch(() => null);
  return { ok: false, error: data?.error ?? "Couldn't save that. Please try again." };
}

/** Removes empty fields, so optional ones are left out rather than sent blank. */
const filled = (form: FormData) => Object.fromEntries([...form.entries()].filter(([, value]) => String(value).trim() !== ""));

export function AccountForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function add(values: Record<string, unknown>) {
    const result = await send("/api/investments/accounts", "POST", values);
    setMessage(result.ok ? `Added ${values.name}.` : result.error!);
    if (result.ok) router.refresh();
    return result.ok;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (await add(filled(new FormData(form)))) form.reset();
  }

  return (
    <section aria-labelledby="add-account" className="rounded-[1.5rem] border border-line bg-surface p-5">
      <h2 id="add-account" className="text-lg font-semibold">
        Add an account
      </h2>
      <p className="mt-1 text-sm text-dim">Only a name for it. Never enter account numbers or passwords here.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" className={OUTLINE} onClick={() => add({ name: "Interactive Brokers", institution: "Interactive Brokers", currency: "USD" })}>
          + Interactive Brokers (USD)
        </Button>
        <Button type="button" variant="ghost" className={OUTLINE} onClick={() => add({ name: "Sarwa", institution: "Sarwa", currency: "USD" })}>
          + Sarwa (USD)
        </Button>
      </div>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end">
        <label className="block text-sm">
          Name
          <input className={FIELD} name="name" required placeholder="e.g. IBKR long-term" />
        </label>
        <label className="block text-sm">
          Broker or bank
          <input className={FIELD} name="institution" required />
        </label>
        <label className="block text-sm">
          Currency
          <input className={FIELD} name="currency" defaultValue="USD" maxLength={3} required />
        </label>
        <Button type="submit" className="h-11">
          Add account
        </Button>
      </form>
      <p role="status" className="mt-2 min-h-5 text-sm">
        {message}
      </p>
    </section>
  );
}

export function AccountActions({ id, name, isActive }: { id: string; name: string; isActive: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={OUTLINE}
        onClick={async () => {
          const result = await send(`/api/investments/accounts/${id}`, "PATCH", { isActive: !isActive });
          setMessage(result.ok ? "" : result.error!);
          router.refresh();
        }}
      >
        {isActive ? "Archive" : "Restore"} <span className="sr-only">{name}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={OUTLINE}
        onClick={async () => {
          if (!window.confirm(`Delete ${name}?`)) return;
          const result = await send(`/api/investments/accounts/${id}`, "DELETE");
          setMessage(result.ok ? "" : result.error!);
          router.refresh();
        }}
      >
        Delete <span className="sr-only">{name}</span>
      </Button>
      {message && (
        <p role="status" className="basis-full text-sm">
          {message}
        </p>
      )}
    </div>
  );
}

const TYPES = [
  ["BUY", "Buy"],
  ["SELL", "Sell"],
  ["DIVIDEND", "Dividend"],
  ["INTEREST", "Interest"],
  ["DEPOSIT", "Deposit"],
  ["WITHDRAWAL", "Withdrawal"],
  ["FEE", "Fee"],
  ["SPLIT", "Stock split"],
] as const;

export function TransactionForm({ accounts }: { accounts: { id: string; name: string; currency: string }[] }) {
  const router = useRouter();
  const [type, setType] = useState<string>("BUY");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const trade = type === "BUY" || type === "SELL";
  const needsSymbol = trade || type === "SPLIT" || type === "DIVIDEND";
  const today = new Date().toISOString().slice(0, 10);
  const accountCurrency = accounts.find((a) => a.id === accountId)?.currency ?? "USD";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("Saving…");
    const form = event.currentTarget;
    const result = await send("/api/investments/transactions", "POST", filled(new FormData(form)));
    setBusy(false);
    setMessage(result.ok ? "Saved." : result.error!);
    if (result.ok) {
      form.reset();
      setType("BUY");
      router.refresh();
    }
  }

  if (!accounts.length) return <p className="rounded-xl border border-line p-4 text-sm text-dim">Add an account first, on the Accounts tab.</p>;

  return (
    <section aria-labelledby="add-transaction" className="rounded-[1.5rem] border border-line bg-surface p-5">
      <h2 id="add-transaction" className="text-lg font-semibold">
        Add a transaction
      </h2>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          Account
          <select className={FIELD} name="accountId" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Type
          <select className={FIELD} name="type" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Date
          <input className={FIELD} type="date" name="date" defaultValue={today} max={today} required />
        </label>
        <label className="block text-sm">
          Currency
          <input key={accountCurrency} className={FIELD} name="currency" defaultValue={accountCurrency} maxLength={3} required />
        </label>
        {needsSymbol && (
          <>
            <label className="block text-sm">
              Symbol
              <input className={`${FIELD} uppercase`} name="symbol" required placeholder="e.g. VOO" />
            </label>
            <label className="block text-sm">
              Name <span className="text-dim">(first time only)</span>
              <input className={FIELD} name="instrumentName" placeholder="e.g. Vanguard S&P 500 ETF" />
            </label>
            <label className="block text-sm">
              Kind <span className="text-dim">(first time only)</span>
              <select className={FIELD} name="assetClass" defaultValue="STOCK">
                <option value="STOCK">Stock</option>
                <option value="ETF">ETF</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
          </>
        )}
        {(trade || type === "SPLIT") && (
          <label className="block text-sm">
            {type === "SPLIT" ? "Ratio (4 for a 4-for-1 split)" : "Shares"}
            <input className={FIELD} name="quantity" inputMode="decimal" required />
          </label>
        )}
        {trade && (
          <label className="block text-sm">
            Price per share
            <input className={FIELD} name="price" inputMode="decimal" required />
          </label>
        )}
        {!trade && type !== "SPLIT" && (
          <label className="block text-sm">
            Amount
            <input className={FIELD} name="amount" inputMode="decimal" required />
          </label>
        )}
        {type !== "SPLIT" && (
          <label className="block text-sm">
            {type === "DIVIDEND" || type === "INTEREST" ? "Tax withheld" : "Fees"}
            <input className={FIELD} name="fees" inputMode="decimal" placeholder="0" />
          </label>
        )}
        <label className="block text-sm">
          AED per unit <span className="text-dim">(optional)</span>
          <input className={FIELD} name="fxRateToBase" inputMode="decimal" placeholder="Looked up for you" />
        </label>
        <label className="block text-sm sm:col-span-2">
          Notes
          <input className={FIELD} name="notes" />
        </label>
        <div className="flex items-end">
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            Save transaction
          </Button>
        </div>
      </form>
      <p role="status" className="mt-2 min-h-5 text-sm">
        {message}
      </p>
    </section>
  );
}

export function DeleteTransaction({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={OUTLINE}
      onClick={async () => {
        if (!window.confirm(`Delete this transaction: ${label}?`)) return;
        await send(`/api/investments/transactions/${id}`, "DELETE");
        router.refresh();
      }}
    >
      Delete <span className="sr-only">{label}</span>
    </Button>
  );
}

export function PriceForm({ instrumentId, symbol, currency }: { instrumentId: string; symbol: string; currency: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await send("/api/investments/prices", "POST", { instrumentId, price: String(new FormData(form).get("price") ?? "").trim() });
    setMessage(result.ok ? "" : result.error!);
    if (result.ok) {
      form.reset();
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <label className="sr-only" htmlFor={`price-${instrumentId}`}>
        New price for {symbol} in {currency}
      </label>
      <input id={`price-${instrumentId}`} name="price" inputMode="decimal" required placeholder="New price" className="h-9 w-24 rounded-lg border border-line-strong bg-bg px-2 text-sm text-txt" />
      <Button type="submit" variant="ghost" size="sm" className={OUTLINE}>
        Set <span className="sr-only">price for {symbol}</span>
      </Button>
      {message && <span role="status">{message}</span>}
    </form>
  );
}
