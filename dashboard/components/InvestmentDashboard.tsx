"use client";

import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import type { DashboardData, SeriesKey } from "@/lib/investments/dashboard";
import { cn } from "@/lib/utils";

const aedFormat = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 });
const aedExact = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-AE", { notation: "compact", maximumFractionDigits: 1 });
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

const SERIES: { key: SeriesKey; label: string; hint: string }[] = [
  { key: "bought", label: "Bought", hint: "Shares bought, including fees" },
  { key: "dividends", label: "Dividends", hint: "Dividends and interest after tax" },
  { key: "deposits", label: "Deposits", hint: "Money added to your accounts" },
];

const TYPE_LABEL: Record<string, string> = { BUY: "Bought", SELL: "Sold", DIVIDEND: "Dividend", INTEREST: "Interest", DEPOSIT: "Deposit", WITHDRAWAL: "Withdrawal", FEE: "Fee", SPLIT: "Split" };

/** Never colour alone: an arrow and a sign go with every gain or loss. */
function Change({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-dim">–</span>;
  if (value === 0) return <span>0{suffix}</span>;
  return <span className={value > 0 ? "text-gain" : "text-loss"}>{`${value > 0 ? "▲ +" : "▼ −"}${Math.abs(value).toFixed(1)}${suffix}`}</span>;
}

const card = "min-w-0 rounded-[1.75rem] border border-line bg-surface/80 p-5 backdrop-blur sm:p-6";

/** A rounded-up axis maximum: 1, 2 or 5 times a power of ten. */
function niceMax(value: number) {
  if (value <= 0) return 100;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].find((step) => step * power >= value) ?? 10) * power;
}

function MonthlyBars({ months, selected, onSelect }: { months: DashboardData["months"]; selected: string | null; onSelect: (key: string | null) => void }) {
  const [series, setSeries] = useState<SeriesKey>("bought");
  const [hovered, setHovered] = useState<string | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const max = niceMax(Math.max(...months.map((m) => m[series])));
  const ticks = [max, max * 0.75, max * 0.5, max * 0.25, 0];
  const active = hovered ?? selected;
  const current = SERIES.find((s) => s.key === series)!;
  const titleId = useId();

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? months.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    buttons.current[Math.max(0, Math.min(months.length - 1, next))]?.focus();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold">
          Last 12 months · <span className="text-accent-text">{current.label}</span>
        </h2>
        <div role="group" aria-label="What the bars show" className="flex rounded-full border border-line bg-bg/60 p-1">
          {SERIES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={series === s.key}
              onClick={() => setSeries(s.key)}
              className={cn("h-9 rounded-full px-3 text-sm transition-colors", series === s.key ? "bg-surface-2 text-txt" : "text-dim hover:text-txt")}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-dim">{current.hint}. Select a month to filter your transactions.</p>

      <div className="mt-6 grid grid-cols-[auto_1fr] gap-x-3">
        {/* Recessive axis: the labels stay quiet so the bars carry the reading. */}
        <div aria-hidden className="flex h-56 flex-col justify-between text-right font-mono text-xs text-dim">
          {ticks.map((tick) => (
            <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {compact.format(tick)}
            </span>
          ))}
        </div>
        <div className="relative h-56 min-w-0">
          <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((tick) => (
              <span key={tick} className="border-t border-dashed border-line" />
            ))}
          </div>
          <div role="group" aria-labelledby={titleId} className="relative flex h-full items-end justify-between gap-1">
            {months.map((m, index) => {
              const value = m[series];
              const height = value > 0 ? Math.max((value / max) * 100, 2) : 0;
              const isActive = active === m.key;
              const isSelected = selected === m.key;
              return (
                <div key={m.key} className="relative flex h-full flex-1 justify-center">
                  {isActive && (
                    <span role="presentation" className="pointer-events-none absolute -top-9 z-10 rounded-full border border-line-strong bg-surface px-3 py-1 font-mono text-xs whitespace-nowrap shadow-lg">
                      {aedFormat.format(value)}
                    </span>
                  )}
                  <button
                    ref={(el) => {
                      buttons.current[index] = el;
                    }}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={`${m.label} ${m.year}: ${aedExact.format(value)}`}
                    onClick={() => onSelect(isSelected ? null : m.key)}
                    onMouseEnter={() => setHovered(m.key)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(m.key)}
                    onBlur={() => setHovered(null)}
                    onKeyDown={(event) => onKey(event, index)}
                    // The hit area is the whole column, wider than the bar itself.
                    className="group flex h-full w-full items-end justify-center rounded-lg focus-visible:outline-offset-0"
                  >
                    <span
                      className={cn("w-2.5 rounded-t-[4px] transition-[height,background] duration-300 sm:w-3", isSelected || isActive ? "bg-brand-2 shadow-[0_0_18px_var(--brand-2)]" : "bg-gradient-to-t from-transparent to-brand shadow-[0_0_14px_rgba(52,211,153,0.35)]")}
                      style={{ height: `${height}%` }}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <span />
        <div aria-hidden className="mt-2 flex justify-between gap-1">
          {months.map((m) => (
            <span key={m.key} className={cn("min-w-0 flex-1 rounded-full py-1 text-center text-xs", selected === m.key ? "bg-surface-2 text-txt" : "text-dim")}>
              {/* Twelve full names don't fit a phone, so they shorten to initials there. */}
              <span className="sm:hidden">{m.label.slice(0, 1)}</span>
              <span className="hidden sm:inline">{m.label}</span>
            </span>
          ))}
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-dim hover:text-txt">Show as a table</summary>
        <div className="relative mt-2 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left">
            <thead className="text-dim">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Month</th>
                {SERIES.map((s) => (
                  <th key={s.key} scope="col" className="py-1 pr-3 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key} className="border-t border-line">
                  <th scope="row" className="py-1 pr-3 font-normal">
                    {m.label} {m.year}
                  </th>
                  {SERIES.map((s) => (
                    <td key={s.key} className="py-1 pr-3 text-right font-mono">
                      {aedExact.format(m[s.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Ring({ label, value, display }: { label: string; value: number; display: React.ReactNode }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, value)) / 100;
  const gradientId = useId();
  return (
    <figure className="flex flex-col items-center gap-2">
      <div className="relative size-24">
        <svg viewBox="0 0 80 80" className="size-24 -rotate-90" aria-hidden>
          <circle cx="40" cy="40" r={radius} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
          <circle cx="40" cy="40" r={radius} fill="none" stroke={`url(#${gradientId})`} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${filled * circumference} ${circumference}`} className="transition-[stroke-dasharray] duration-500" />
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--brand)" />
              <stop offset="100%" stopColor="var(--brand-2)" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold">{display}</span>
      </div>
      <figcaption className="text-sm text-dim">{label}</figcaption>
    </figure>
  );
}

function AccountCards({ accounts }: { accounts: DashboardData["accounts"] }) {
  const [index, setIndex] = useState(0);
  if (!accounts.length) {
    return (
      <p className="mt-4 text-sm text-dim">
        No accounts yet. <Link href="/investments/accounts" className="text-accent-text underline">Add Interactive Brokers and Sarwa</Link>.
      </p>
    );
  }
  const account = accounts[index % accounts.length]!;
  const move = (step: number) => setIndex((i) => (i + step + accounts.length) % accounts.length);
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" aria-label="Previous account" disabled={accounts.length < 2} onClick={() => move(-1)} className="h-11 w-11 rounded-full">
          <ChevronLeft aria-hidden className="size-5" />
        </Button>
        <div aria-live="polite" className="relative min-w-0 flex-1 overflow-hidden rounded-[1.5rem] border border-line-strong bg-gradient-to-br from-surface-2 to-bg p-5 shadow-2xl">
          <div aria-hidden className="bg-gradient-accent absolute -top-10 -right-10 size-32 rounded-full opacity-25 blur-2xl" />
          <p className="font-display text-lg font-semibold break-words">{account.name}</p>
          <p className="mt-5 font-display text-2xl font-semibold">{aedFormat.format(account.value)}</p>
          <p className="mt-2 font-mono text-xs text-dim">
            {account.institution} · {account.currency} · {account.holdings} {account.holdings === 1 ? "holding" : "holdings"}
          </p>
          <p className="mt-3 font-mono text-xs text-dim">
            {index + 1} of {accounts.length}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" aria-label="Next account" disabled={accounts.length < 2} onClick={() => move(1)} className="h-11 w-11 rounded-full">
          <ChevronRight aria-hidden className="size-5" />
        </Button>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Ring label="Share of portfolio" value={account.sharePct} display={`${account.sharePct.toFixed(0)}%`} />
        <Ring label="Return on holdings" value={Math.abs(account.returnPct ?? 0)} display={<Change value={account.returnPct} suffix="%" />} />
      </div>
      <ul className="mt-6 space-y-2 border-t border-line pt-4 text-sm">
        {accounts.map((a, i) => (
          <li key={a.id}>
            <button
              type="button"
              aria-current={i === index % accounts.length ? "true" : undefined}
              onClick={() => setIndex(i)}
              className={cn("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left", i === index % accounts.length ? "bg-surface-2" : "hover:bg-surface-2")}
            >
              <span className="min-w-0 truncate">{a.name}</span>
              <span className="shrink-0 font-mono">
                {aedFormat.format(a.value)} <span className="text-dim">· {a.sharePct.toFixed(0)}%</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Up to three holdings and Other, sized by value. Placed by hand, as in a small packed layout. */
const SPOTS = [
  { x: 185, y: 128, max: 92 },
  { x: 72, y: 112, max: 66 },
  { x: 300, y: 104, max: 60 },
  { x: 118, y: 42, max: 44 },
];
const FILL: Record<string, string> = { "1": "var(--series-1)", "2": "var(--series-2)", "3": "var(--series-3)", other: "var(--series-other)" };

function Bubbles({ bubbles }: { bubbles: DashboardData["bubbles"] }) {
  const [focused, setFocused] = useState<string | null>(null);
  if (!bubbles.length) return <p className="mt-4 text-sm text-dim">Your holdings will appear here.</p>;
  const largest = Math.max(...bubbles.map((b) => b.value));
  return (
    <div>
      <svg viewBox="0 0 370 230" className="mt-2 w-full" role="group" aria-label="Holdings by value">
        {bubbles.map((b, i) => {
          const spot = SPOTS[i]!;
          const r = Math.max(36, Math.sqrt(b.value / largest) * spot.max);
          const dim = focused && focused !== b.label;
          return (
            <g
              key={b.label}
              tabIndex={0}
              role="img"
              aria-label={`${b.label}${b.name ? `, ${b.name}` : ""}: ${aedFormat.format(b.value)}, ${b.pct}% of holdings`}
              onMouseEnter={() => setFocused(b.label)}
              onMouseLeave={() => setFocused(null)}
              onFocus={() => setFocused(b.label)}
              onBlur={() => setFocused(null)}
              className="cursor-default outline-none [&:focus-visible>circle]:stroke-[var(--txt)]"
              style={{ opacity: dim ? 0.45 : 1, transition: "opacity 200ms" }}
            >
              {/* A surface-coloured ring keeps overlapping bubbles apart. */}
              <circle cx={spot.x} cy={spot.y} r={r} fill={FILL[String(b.slot)]} stroke="var(--surface)" strokeWidth={3} />
              <text x={spot.x} y={spot.y - 2} textAnchor="middle" className="fill-white font-mono text-[17px] font-semibold" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.35)", strokeWidth: 2 }}>
                {b.label}
              </text>
              <text x={spot.x} y={spot.y + 17} textAnchor="middle" className="fill-white font-mono text-[14px]" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.35)", strokeWidth: 2 }}>
                {b.pct}%
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        {bubbles.map((b) => (
          <li key={b.label} className="flex items-center gap-2">
            <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: FILL[String(b.slot)] }} />
            <span className="min-w-0 truncate">
              <span className="font-mono font-semibold">{b.label}</span> <span className="text-dim">{aedFormat.format(b.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TransactionList({ transactions, month, onClear }: { transactions: DashboardData["transactions"]; month: { key: string; label: string; year: number } | null; onClear: () => void }) {
  const shown = (month ? transactions.filter((t) => t.monthKey === month.key) : transactions).slice(0, 8);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Transactions{month && <span className="text-dim"> · {month.label} {month.year}</span>}
        </h2>
        {month ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Show all
          </Button>
        ) : (
          <Link href="/investments/transactions" className="text-sm text-dim hover:text-txt">
            All
          </Link>
        )}
      </div>
      {shown.length ? (
        <ul className="mt-4 space-y-4">
          {shown.map((t) => (
            <li key={t.id} className="flex items-center gap-3">
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-mono text-xs font-semibold">
                {t.symbol ? t.symbol.slice(0, 4) : t.amountBase >= 0 ? <ArrowDownLeft className="size-4 text-gain" /> : <ArrowUpRight className="size-4 text-dim" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">
                  {TYPE_LABEL[t.type]} {t.symbol ?? ""}
                  {t.quantity && (t.type === "BUY" || t.type === "SELL") ? (
                    <span className="text-dim">
                      {" "}
                      · {t.quantity} {t.quantity === 1 ? "share" : "shares"}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-sm text-dim">
                  {dayFormat.format(new Date(t.date))} · {t.account}
                </p>
              </div>
              <p className="shrink-0 text-right font-mono text-xs sm:text-sm">
                {t.amountBase > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <ArrowDownLeft aria-hidden className="size-3.5 text-gain" />
                    <span className="sr-only">In:</span>+{aedExact.format(t.amountBase)}
                  </span>
                ) : t.amountBase < 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <ArrowUpRight aria-hidden className="size-3.5 text-dim" />
                    <span className="sr-only">Out:</span>−{aedExact.format(Math.abs(t.amountBase))}
                  </span>
                ) : (
                  "–"
                )}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-dim">{month ? "Nothing in this month." : "No transactions yet."}</p>
      )}
    </div>
  );
}

function QuickAdd({ accounts, disabled }: { accounts: DashboardData["accountOptions"]; disabled: boolean }) {
  const router = useRouter();
  const [type, setType] = useState("BUY");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const field = "h-11 w-full rounded-xl border border-line-strong bg-bg px-3 text-sm text-txt";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries([...new FormData(form).entries()].filter(([, v]) => String(v).trim() !== ""));
    const account = accounts.find((a) => a.id === values.accountId);
    setBusy(true);
    setMessage("Saving…");
    const response = await fetch("/api/investments/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...values, type, date: new Date().toISOString().slice(0, 10), currency: account?.currency ?? "USD" }),
    }).catch(() => null);
    setBusy(false);
    if (response?.ok) {
      setMessage("Saved.");
      form.reset();
      router.refresh();
      return;
    }
    const body = await response?.json().catch(() => null);
    setMessage(body?.error ?? "Couldn't save that. Please try again.");
  }

  return (
    <div>
      <h2 className="text-lg font-semibold">Quick add</h2>
      <p className="mt-1 text-sm text-dim">Record today&apos;s buy or deposit. This only records it: nothing is traded or sent.</p>
      {disabled ? (
        <p className="mt-4 rounded-xl border border-line p-3 text-sm text-dim">{accounts.length ? "Not available in the sample preview." : "Add an account first."}</p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div role="group" aria-label="Transaction type" className="flex rounded-full border border-line bg-bg/60 p-1">
            {[
              ["BUY", "Buy"],
              ["DEPOSIT", "Deposit"],
              ["DIVIDEND", "Dividend"],
            ].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value!)} className={cn("h-9 flex-1 rounded-full text-sm", type === value ? "bg-surface-2 text-txt" : "text-dim hover:text-txt")}>
                {label}
              </button>
            ))}
          </div>
          <label className="block text-sm">
            Account
            <select name="accountId" className={`mt-1 ${field}`}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {type !== "DEPOSIT" && (
            <label className="block text-sm">
              Symbol
              <input name="symbol" required className={`mt-1 uppercase ${field}`} placeholder="e.g. VOO" />
            </label>
          )}
          {type === "BUY" ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                Shares
                <input name="quantity" inputMode="decimal" required className={`mt-1 ${field}`} />
              </label>
              <label className="block text-sm">
                Price
                <input name="price" inputMode="decimal" required className={`mt-1 ${field}`} />
              </label>
            </div>
          ) : (
            <label className="block text-sm">
              Amount
              <input name="amount" inputMode="decimal" required className={`mt-1 ${field}`} />
            </label>
          )}
          <Button type="submit" className="h-11 w-full rounded-xl" disabled={busy}>
            Record {type === "BUY" ? "buy" : type === "DEPOSIT" ? "deposit" : "dividend"}
          </Button>
          <p role="status" className="min-h-5 text-sm">
            {message}
          </p>
        </form>
      )}
    </div>
  );
}

export function InvestmentDashboard({ data }: { data: DashboardData }) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const month = data.months.find((m) => m.key === selectedMonth) ?? null;

  return (
    <div className="space-y-5">
      {data.isSample && (
        <p role="note" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-2/60 bg-brand-2/10 p-3 text-sm">
          <span>
            <strong>Sample data.</strong> These numbers are made up to show the design. Nothing here is yours or saved.
          </span>
          <Link href="/investments" className="font-medium underline">
            Back to my portfolio
          </Link>
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <section aria-label="Portfolio summary and monthly activity" className={card}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="font-display text-2xl leading-tight font-semibold sm:text-3xl">
                Your portfolio
                <span className="ml-3 inline-block rounded-full bg-brand px-2 py-0.5 align-middle font-mono text-xs font-semibold text-on-accent">AED</span>
              </h1>
              <p className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">{aedFormat.format(data.totals.value)}</p>
              <p className="mt-2 text-sm">
                <Change value={data.totals.unrealisedPct} suffix="%" /> <span className="text-dim">on current holdings</span>
              </p>
            </div>
            <dl className="flex flex-wrap gap-6">
              <div className="flex flex-col">
                <dt className="text-sm text-dim">Money in · 12 months</dt>
                <dd className="order-first flex items-center gap-1 font-mono text-lg">
                  <ArrowDownLeft aria-hidden className="size-4 text-gain" />
                  {aedFormat.format(data.moneyIn)}
                </dd>
              </div>
              <div className="flex flex-col border-l border-line pl-6">
                <dt className="text-sm text-dim">Money out · 12 months</dt>
                <dd className="order-first flex items-center gap-1 font-mono text-lg">
                  <ArrowUpRight aria-hidden className="size-4 text-dim" />
                  {aedFormat.format(data.moneyOut)}
                </dd>
              </div>
            </dl>
          </div>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Invested", aedFormat.format(data.totals.costBasis)],
              ["Realised", null],
              ["Dividends", aedFormat.format(data.totals.income)],
              ["Cash", aedFormat.format(data.totals.cash)],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col rounded-2xl border border-line bg-bg/50 p-3">
                <dt className="text-xs text-dim">{label}</dt>
                <dd className="order-first font-mono text-sm font-semibold">
                  {value ?? (data.totals.realised === 0 ? aedFormat.format(0) : <span className={data.totals.realised > 0 ? "text-gain" : "text-loss"}>{`${data.totals.realised > 0 ? "▲ +" : "▼ −"}${aedFormat.format(Math.abs(data.totals.realised))}`}</span>)}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 border-t border-line pt-6">
            <MonthlyBars months={data.months} selected={selectedMonth} onSelect={setSelectedMonth} />
          </div>
        </section>

        <section aria-label="Accounts" className={card}>
          <h2 className="text-center text-lg font-semibold">My accounts</h2>
          <AccountCards accounts={data.accounts} />
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[1fr_1fr_22rem]">
        <section aria-label="Quick add" className={card}>
          <QuickAdd accounts={data.accountOptions} disabled={data.isSample || !data.accountOptions.length} />
        </section>
        <section aria-label="Top holdings" className={card}>
          <h2 className="text-lg font-semibold">Top holdings</h2>
          <Bubbles bubbles={data.bubbles} />
        </section>
        <section aria-label="Recent transactions" className={cn(card, "lg:col-span-2 xl:col-span-1")}>
          <TransactionList transactions={data.transactions} month={month} onClear={() => setSelectedMonth(null)} />
        </section>
      </div>
    </div>
  );
}
