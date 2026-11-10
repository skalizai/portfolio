import { D, type Dec, type Portfolio, type Tx } from "@/lib/investments/holdings";

/**
 * Shapes the portfolio for the interactive overview. Everything is worked out here with Decimal;
 * the page only receives plain numbers for display.
 */

export type SeriesKey = "bought" | "dividends" | "deposits";

export type DashboardData = {
  isSample: boolean;
  totals: { value: number; costBasis: number; unrealised: number; unrealisedPct: number | null; realised: number; income: number; cash: number };
  moneyIn: number;
  moneyOut: number;
  months: { key: string; label: string; year: number; bought: number; dividends: number; deposits: number }[];
  accounts: { id: string; name: string; institution: string; currency: string; value: number; holdings: number; sharePct: number; returnPct: number | null }[];
  bubbles: { label: string; name: string; value: number; pct: number; slot: 1 | 2 | 3 | "other" }[];
  transactions: { id: string; date: string; monthKey: string; type: string; symbol: string | null; account: string; amountBase: number; amount: number; currency: string; quantity: number | null }[];
  accountOptions: { id: string; name: string; currency: string }[];
};

type Inputs = {
  isSample: boolean;
  now: Date;
  accounts: { id: string; name: string; institution: string; currency: string; isActive: boolean }[];
  instruments: { id: string; symbol: string; name: string }[];
  transactions: (Tx & { createdAt?: Date })[];
  portfolio: Portfolio;
};

const num = (value: Dec) => Number(value.toFixed(2));
const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

export function buildDashboard({ isSample, now, accounts, instruments, transactions, portfolio }: Inputs): DashboardData {
  const { totals, positions, cash } = portfolio;

  // The last twelve months, oldest first, ending with this one.
  const months = Array.from({ length: 12 }, (_, i) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (11 - i), 1));
    return { key: monthKey(date), label: monthLabel.format(date), year: date.getUTCFullYear(), bought: new D(0), dividends: new D(0), deposits: new D(0) };
  });
  const byMonth = new Map(months.map((m) => [m.key, m]));
  let moneyIn = new D(0);
  let moneyOut = new D(0);
  for (const tx of transactions) {
    const month = byMonth.get(monthKey(tx.date));
    if (!month) continue;
    const fx = tx.fxRateToBase;
    if (tx.type === "BUY") month.bought = month.bought.plus(tx.amount.plus(tx.fees).times(fx));
    if (tx.type === "DIVIDEND" || tx.type === "INTEREST") month.dividends = month.dividends.plus(tx.amount.minus(tx.fees).times(fx));
    if (tx.type === "DEPOSIT") {
      month.deposits = month.deposits.plus(tx.amount.times(fx));
      moneyIn = moneyIn.plus(tx.amount.times(fx));
    }
    if (tx.type === "WITHDRAWAL") moneyOut = moneyOut.plus(tx.amount.times(fx));
  }

  const total = totals.totalBase;
  const accountCards = accounts
    .filter((a) => a.isActive || positions.some((p) => p.accountId === a.id))
    .map((a) => {
      const held = positions.filter((p) => p.accountId === a.id);
      const value = held.reduce((sum, p) => sum.plus(p.marketValueBase), new D(0)).plus(cash.filter((c) => c.accountId === a.id).reduce((sum, c) => sum.plus(c.balanceBase), new D(0)));
      const cost = held.reduce((sum, p) => sum.plus(p.costBasisBase), new D(0));
      const unrealised = held.reduce((sum, p) => sum.plus(p.unrealisedBase), new D(0));
      return {
        id: a.id,
        name: a.name,
        institution: a.institution,
        currency: a.currency,
        value: num(value),
        holdings: held.length,
        sharePct: total.gt(0) ? Number(value.dividedBy(total).times(100).toFixed(1)) : 0,
        returnPct: cost.gt(0) ? Number(unrealised.dividedBy(cost).times(100).toFixed(1)) : null,
      };
    });

  // Holdings across accounts, largest first. Bubbles stay readable for three, so the rest fold into Other.
  const symbol = new Map(instruments.map((i) => [i.id, i]));
  const byInstrument = new Map<string, Dec>();
  for (const p of positions) byInstrument.set(p.instrumentId, (byInstrument.get(p.instrumentId) ?? new D(0)).plus(p.marketValueBase));
  const ranked = [...byInstrument].sort((a, b) => b[1].comparedTo(a[1]));
  const held = totals.marketValueBase;
  const pct = (value: Dec) => (held.gt(0) ? Number(value.dividedBy(held).times(100).toFixed(1)) : 0);
  const bubbles: DashboardData["bubbles"] = ranked.slice(0, 3).map(([id, value], i) => ({
    label: symbol.get(id)?.symbol ?? "?",
    name: symbol.get(id)?.name ?? "",
    value: num(value),
    pct: pct(value),
    slot: (i + 1) as 1 | 2 | 3,
  }));
  const rest = ranked.slice(3).reduce((sum, [, value]) => sum.plus(value), new D(0));
  if (rest.gt(0)) bubbles.push({ label: "Other", name: `${ranked.length - 3} more`, value: num(rest), pct: pct(rest), slot: "other" });

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const signFor: Record<string, number> = { BUY: -1, WITHDRAWAL: -1, FEE: -1, SELL: 1, DEPOSIT: 1, DIVIDEND: 1, INTEREST: 1, SPLIT: 0 };
  const recent = [...transactions]
    .sort((a, b) => b.date.getTime() - a.date.getTime() || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .slice(0, 60)
    .map((tx) => {
      const cashAmount = tx.type === "BUY" ? tx.amount.plus(tx.fees) : tx.type === "SELL" || tx.type === "DIVIDEND" || tx.type === "INTEREST" ? tx.amount.minus(tx.fees) : tx.amount;
      return {
        id: tx.id,
        date: tx.date.toISOString().slice(0, 10),
        monthKey: monthKey(tx.date),
        type: tx.type,
        symbol: tx.instrumentId ? (symbol.get(tx.instrumentId)?.symbol ?? null) : null,
        account: accountName.get(tx.accountId) ?? "",
        amountBase: num(cashAmount.times(tx.fxRateToBase).times(signFor[tx.type] ?? 0)),
        amount: num(cashAmount),
        currency: tx.currency,
        quantity: tx.quantity ? Number(tx.quantity.toFixed(4)) : null,
      };
    });

  return {
    isSample,
    totals: {
      value: num(total),
      costBasis: num(totals.costBasisBase),
      unrealised: num(totals.unrealisedBase),
      unrealisedPct: totals.costBasisBase.gt(0) ? Number(totals.unrealisedBase.dividedBy(totals.costBasisBase).times(100).toFixed(1)) : null,
      realised: num(totals.realisedBase),
      income: num(totals.incomeBase),
      cash: num(totals.cashBase),
    },
    moneyIn: num(moneyIn),
    moneyOut: num(moneyOut),
    months: months.map((m) => ({ key: m.key, label: m.label, year: m.year, bought: num(m.bought), dividends: num(m.dividends), deposits: num(m.deposits) })),
    accounts: accountCards,
    bubbles,
    transactions: recent,
    accountOptions: accounts.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
  };
}
