"use client";

import { useId, useState } from "react";

type OutflowMonth = { month: string; payrollAed: number; remittancesAed: number; expensesAed: number };
type Slice = { key: string; name: string; aed: number };

const aed = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const monthShort = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const asDate = (month: string) => new Date(`${month}-01T00:00:00Z`);

// Three validated series colours, always in this order, then grey for "Other".
const SERIES = [
  { key: "payrollAed", label: "Payroll", color: "var(--series-1)" },
  { key: "remittancesAed", label: "Sent home", color: "var(--series-2)" },
  { key: "expensesAed", label: "Expenses", color: "var(--series-3)" },
] as const;
const SLICE_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-other)"];

function niceMax(value: number) {
  if (value <= 0) return 100;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-dim">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-sm" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Six months of outflow, stacked by payroll, money sent home and expenses, all in AED. */
export function OutflowChart({ months, selected }: { months: OutflowMonth[]; selected: string }) {
  const [active, setActive] = useState<string | null>(null);
  const titleId = useId();
  const totals = months.map((m) => m.payrollAed + m.remittancesAed + m.expensesAed);
  const max = niceMax(Math.max(...totals));
  const ticks = [max, max / 2, 0];
  const shown = months.find((m) => m.month === active);

  return (
    <figure>
      <figcaption id={titleId} className="font-semibold">
        Monthly outflow, last 6 months <span className="font-normal text-dim">(AED)</span>
      </figcaption>
      <div className="mt-2">
        <Legend items={SERIES.map((s) => ({ label: s.label, color: s.color }))} />
      </div>
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-3">
        <div aria-hidden className="flex h-48 flex-col justify-between text-right font-mono text-xs text-dim">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {compact.format(t)}
            </span>
          ))}
        </div>
        <div className="relative h-48 min-w-0">
          <div aria-hidden className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((t) => (
              <span key={t} className="border-t border-dashed border-line" />
            ))}
          </div>
          <ul aria-labelledby={titleId} className="relative flex h-full items-end gap-2">
            {months.map((m, i) => {
              const label = `${monthLong.format(asDate(m.month))}: ${aed.format(totals[i]!)} in all. ${SERIES.map((s) => `${s.label} ${aed.format(m[s.key])}`).join(", ")}.`;
              return (
                <li key={m.month} className="relative flex h-full flex-1 flex-col justify-end">
                  {/* The whole column is the hit area, wider than the bar. */}
                  <button
                    type="button"
                    aria-label={label}
                    className="absolute inset-0 z-10 rounded-md focus-visible:outline-2 focus-visible:outline-accent-text"
                    onMouseEnter={() => setActive(m.month)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(m.month)}
                    onBlur={() => setActive(null)}
                  />
                  <div className={`mx-auto flex w-full max-w-10 flex-col-reverse gap-[2px] ${active && active !== m.month ? "opacity-50" : ""}`} style={{ height: `${(totals[i]! / max) * 100}%` }}>
                    {SERIES.map((s, si) => {
                      const value = m[s.key];
                      if (value <= 0) return null;
                      const isTop = SERIES.slice(si + 1).every((later) => m[later.key] <= 0);
                      return <span key={s.key} className={isTop ? "rounded-t" : ""} style={{ background: s.color, flexGrow: value, minHeight: 2 }} />;
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
          {shown && (
            <div role="presentation" className="pointer-events-none absolute top-0 right-0 z-20 rounded-xl border border-line-strong bg-surface px-3 py-2 text-xs shadow-lg">
              <p className="font-semibold">{monthLong.format(asDate(shown.month))}</p>
              {SERIES.map((s) => (
                <p key={s.key} className="flex items-center gap-2">
                  <span aria-hidden className="size-2.5 rounded-sm" style={{ background: s.color }} />
                  {s.label} <span className="ml-auto pl-3 font-mono">{aed.format(shown[s.key])}</span>
                </p>
              ))}
              <p className="mt-1 border-t border-line pt-1 font-mono">{aed.format(shown.payrollAed + shown.remittancesAed + shown.expensesAed)}</p>
            </div>
          )}
        </div>
        <span />
        <div aria-hidden className="mt-1 flex gap-2 text-center font-mono text-xs text-dim">
          {months.map((m) => (
            <span key={m.month} className={`flex-1 ${m.month === selected ? "font-semibold text-txt" : ""}`}>
              {monthShort.format(asDate(m.month))}
            </span>
          ))}
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-dim">Show as a table</summary>
        <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Monthly outflow table">
          <table className="w-full min-w-[28rem] text-left">
            <thead className="text-dim">
              <tr className="border-b border-line">
                <th scope="col" className="py-1 pr-3 font-medium">Month</th>
                {SERIES.map((s) => (
                  <th key={s.key} scope="col" className="py-1 pr-3 text-right font-medium">{s.label}</th>
                ))}
                <th scope="col" className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={m.month} className="border-b border-line">
                  <th scope="row" className="py-1 pr-3 font-normal">{monthLong.format(asDate(m.month))}</th>
                  {SERIES.map((s) => (
                    <td key={s.key} className="py-1 pr-3 text-right font-mono">{aed.format(m[s.key])}</td>
                  ))}
                  <td className="py-1 text-right font-mono">{aed.format(totals[i]!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Shares of a whole as one segmented bar, up to three named parts and "Other", with a labelled legend. */
export function ShareBar({ title, slices, empty }: { title: string; slices: Slice[]; empty: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((t, s) => t + s.aed, 0);
  return (
    <figure className="rounded-[1.5rem] border border-line bg-surface p-5">
      <figcaption className="font-semibold">{title}</figcaption>
      {total > 0 ? (
        <>
          <div className="mt-3 flex h-4 gap-[2px] overflow-hidden rounded" aria-hidden>
            {slices.map((s, i) => (
              <span
                key={s.key}
                className={`h-full first:rounded-l last:rounded-r ${active && active !== s.key ? "opacity-40" : ""}`}
                style={{ background: SLICE_COLORS[s.key === "other" ? 3 : i], flexGrow: s.aed, minWidth: 2 }}
                onMouseEnter={() => setActive(s.key)}
                onMouseLeave={() => setActive(null)}
              />
            ))}
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {slices.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2" onMouseEnter={() => setActive(s.key)} onMouseLeave={() => setActive(null)}>
                <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ background: SLICE_COLORS[s.key === "other" ? 3 : i] }} />
                <span className="min-w-0 flex-1 break-words">{s.name}</span>
                <span className="font-mono">{aed.format(s.aed)}</span>
                <span className="w-10 text-right font-mono text-xs text-dim">{Math.round((s.aed / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-sm text-dim">{empty}</p>
      )}
    </figure>
  );
}
