import Link from "next/link";
import { InvestmentDashboard } from "@/components/InvestmentDashboard";
import { PriceForm } from "@/components/InvestmentForms";
import { buildDashboard } from "@/lib/investments/dashboard";
import { aed, plain, signedAed, signedPct, tone } from "@/lib/investments/format";
import { D, type Dec } from "@/lib/investments/holdings";
import { samplePortfolio } from "@/lib/investments/sample";
import { getPortfolio } from "@/lib/investments/service";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" });

/** A labelled bar per group, with the share written out so it doesn't rely on the bar alone. */
function Allocation({ title, rows }: { title: string; rows: { label: string; value: Dec }[] }) {
  const total = rows.reduce((sum, row) => sum.plus(row.value), new D(0));
  // An id can't contain spaces, or aria-labelledby reads it as several ids.
  const headingId = `alloc-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="rounded-[1.5rem] border border-line bg-surface p-5">
      <h2 id={headingId} className="font-semibold">
        {title}
      </h2>
      {total.gt(0) ? (
        <ul className="mt-3 space-y-3">
          {rows
            .filter((row) => row.value.gt(0))
            .sort((a, b) => b.value.comparedTo(a.value))
            .map((row) => {
              const pct = row.value.dividedBy(total).times(100);
              return (
                <li key={row.label}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="break-words">{row.label}</span>
                    <span className="shrink-0 font-mono">
                      {pct.toFixed(1)}% · {aed(row.value)}
                    </span>
                  </div>
                  <div aria-hidden className="mt-1 h-2 rounded-full bg-surface-2">
                    <div className="bg-gradient-accent h-2 rounded-full" style={{ width: `${Math.max(Number(pct.toFixed(1)), 1)}%` }} />
                  </div>
                </li>
              );
            })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-dim">Nothing held yet.</p>
      )}
    </section>
  );
}

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const isSample = (await searchParams).preview === "sample";
  // The sample preview is built in memory and never saved; the page labels it as made up.
  const source = isSample ? { ...samplePortfolio(), missingRates: [] as string[] } : await getPortfolio();
  const { accounts, instruments, portfolio, missingRates } = source;
  const transactions = "txs" in source ? source.txs : source.transactions;
  const dashboard = buildDashboard({ isSample, now: new Date(), accounts, instruments, transactions, portfolio });
  const { totals, positions, cash } = portfolio;
  const instrument = new Map(instruments.map((i) => [i.id, i]));
  const account = new Map(accounts.map((a) => [a.id, a]));
  const CLASS: Record<string, string> = { STOCK: "Stocks", ETF: "ETFs", OTHER: "Other" };

  const byClass = new Map<string, Dec>();
  for (const p of positions) {
    const key = CLASS[instrument.get(p.instrumentId)?.assetClass ?? "OTHER"]!;
    byClass.set(key, (byClass.get(key) ?? new D(0)).plus(p.marketValueBase));
  }
  if (totals.cashBase.gt(0)) byClass.set("Cash", totals.cashBase);

  const byAccount = new Map<string, Dec>();
  for (const p of positions) byAccount.set(p.accountId, (byAccount.get(p.accountId) ?? new D(0)).plus(p.marketValueBase));
  for (const c of cash) if (c.balanceBase.gt(0)) byAccount.set(c.accountId, (byAccount.get(c.accountId) ?? new D(0)).plus(c.balanceBase));

  return (
    <>
      {!transactions.length ? (
        <div className="rounded-[1.5rem] border border-line bg-surface p-6">
          <h1 className="text-3xl font-semibold">Investments</h1>
          <h2 className="text-lg font-semibold">Start tracking your portfolio</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-dim">
            <li>
              Add your accounts on the <Link className="text-accent-text underline" href="/investments/accounts">Accounts</Link> tab, such as Interactive Brokers and Sarwa.
            </li>
            <li>
              Record your deposits, buys, sells and dividends on the <Link className="text-accent-text underline" href="/investments/transactions">Transactions</Link> tab.
            </li>
            <li>Your holdings, profit or loss and allocation then appear here, in AED.</li>
          </ol>
          <p className="mt-4">
            <Link href="/investments?preview=sample" className="text-accent-text underline">
              Preview with sample data
            </Link>{" "}
            <span className="text-dim">to see how the overview looks. Nothing is saved.</span>
          </p>
        </div>
      ) : (
        <>
          {missingRates.length > 0 && (
            <p role="alert" className="mt-4 rounded-xl border border-line-strong p-3 text-sm">
              Couldn&apos;t find today&apos;s rate for {missingRates.join(", ")}, so those amounts show as zero in AED.
            </p>
          )}
          <div className="mt-2">
            <InvestmentDashboard data={dashboard} />
          </div>

          <section aria-labelledby="holdings" className="mt-6 rounded-[1.5rem] border border-line bg-surface p-5">
            <h2 id="holdings" className="text-lg font-semibold">
              Holdings
            </h2>
            <p className="mt-1 text-sm text-dim">Values in AED. Prices are ones you&apos;ve entered, or the last trade price until you do.</p>
            {/* The table scrolls inside its box on a phone, so the page itself never scrolls sideways. */}
            <div className="relative mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Holdings table">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="text-dim">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2 pr-3 font-medium">Holding</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Account</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Shares</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Avg cost</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Price</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Value</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Profit or loss</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Weight</th>
                    {!isSample && <th scope="col" className="py-2 font-medium">Update price</th>}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const i = instrument.get(p.instrumentId)!;
                    const weight = totals.totalBase.gt(0) ? p.marketValueBase.dividedBy(totals.totalBase).times(100) : null;
                    return (
                      <tr key={`${p.accountId}-${p.instrumentId}`} className="border-b border-line align-top">
                        <th scope="row" className="py-3 pr-3 font-normal">
                          <span className="font-mono font-semibold">{i.symbol}</span>
                          <span className="block text-dim">
                            {i.name} · {i.assetClass === "ETF" ? "ETF" : i.assetClass === "STOCK" ? "Stock" : "Other"}
                          </span>
                        </th>
                        <td className="py-3 pr-3">{account.get(p.accountId)?.name}</td>
                        <td className="py-3 pr-3 text-right font-mono">{plain(p.quantity)}</td>
                        <td className="py-3 pr-3 text-right font-mono">
                          {plain(p.avgCost.toDecimalPlaces(4))} {p.currency}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono">
                          {plain(p.price)} {p.currency}
                          <span className="block font-sans text-xs text-dim">
                            {p.priceFromLastTrade ? "last trade" : "as of"} {p.priceAsOf ? dateFormat.format(p.priceAsOf) : ""}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-right font-mono">{aed(p.marketValueBase)}</td>
                        <td className={`py-3 pr-3 text-right font-mono ${tone(p.unrealisedBase)}`}>
                          {signedAed(p.unrealisedBase)}
                          <span className="block">{signedPct(p.unrealisedPct)}</span>
                        </td>
                        <td className="py-3 pr-3 text-right font-mono">{weight ? `${weight.toFixed(1)}%` : "–"}</td>
                        {!isSample && (
                          <td className="py-3">
                            <PriceForm instrumentId={i.id} symbol={i.symbol} currency={i.currency} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {cash.map((c) => (
                    <tr key={`cash-${c.accountId}-${c.currency}`} className="border-b border-line">
                      <th scope="row" className="py-3 pr-3 font-normal">
                        <span className="font-mono font-semibold">Cash</span>
                        <span className="block text-dim">{c.currency}</span>
                      </th>
                      <td className="py-3 pr-3">{account.get(c.accountId)?.name}</td>
                      <td className="py-3 pr-3 text-right font-mono" colSpan={3}>
                        {plain(c.balance)} {c.currency}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono">{aed(c.balanceBase)}</td>
                      <td colSpan={isSample ? 2 : 3} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cash.some((c) => c.balance.lt(0)) && (
              <p className="mt-3 text-sm text-dim">A negative cash balance usually means a deposit hasn&apos;t been recorded yet.</p>
            )}
          </section>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Allocation title="By type" rows={[...byClass].map(([label, value]) => ({ label, value }))} />
            <Allocation title="By account" rows={[...byAccount].map(([id, value]) => ({ label: account.get(id)?.name ?? "Account", value }))} />
          </div>
        </>
      )}
    </>
  );
}
