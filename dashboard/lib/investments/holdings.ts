import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Holdings, cash and profit or loss, worked out from transactions alone. Average cost uses the
 * weighted-average method, profit is realised on each SELL, and every amount is Decimal.
 * Base amounts are in AED.
 */

export const D = Prisma.Decimal;
export type Dec = Prisma.Decimal;
const ZERO = new D(0);

export type TxType = "BUY" | "SELL" | "DIVIDEND" | "INTEREST" | "DEPOSIT" | "WITHDRAWAL" | "FEE" | "SPLIT";

export type Tx = {
  id: string;
  accountId: string;
  instrumentId: string | null;
  type: TxType;
  date: Date;
  quantity: Dec | null;
  price: Dec | null;
  amount: Dec;
  fees: Dec;
  currency: string;
  fxRateToBase: Dec;
  createdAt?: Date;
};

export type Quote = { price: Dec; currency: string; asOf: Date; source: string };

export type Position = {
  accountId: string;
  instrumentId: string;
  currency: string;
  quantity: Dec;
  /** Per share, in the instrument's currency, including buying fees. */
  avgCost: Dec;
  costBasisBase: Dec;
  price: Dec | null;
  priceAsOf: Date | null;
  /** True when no quote exists and the last trade price stands in. */
  priceFromLastTrade: boolean;
  marketValueBase: Dec;
  unrealisedBase: Dec;
  unrealisedPct: Dec | null;
  realisedBase: Dec;
  incomeBase: Dec;
};

export type CashBalance = { accountId: string; currency: string; balance: Dec; balanceBase: Dec };

export type Portfolio = {
  positions: Position[];
  closed: Position[];
  cash: CashBalance[];
  totals: {
    marketValueBase: Dec;
    cashBase: Dec;
    totalBase: Dec;
    costBasisBase: Dec;
    unrealisedBase: Dec;
    realisedBase: Dec;
    incomeBase: Dec;
    feesBase: Dec;
    netContributionsBase: Dec;
  };
};

type Running = {
  accountId: string;
  instrumentId: string;
  currency: string;
  quantity: Dec;
  cost: Dec;
  costBase: Dec;
  realisedBase: Dec;
  incomeBase: Dec;
  lastTradePrice: Dec | null;
  lastTradeDate: Date | null;
};

const byDate = (a: Tx, b: Tx) => a.date.getTime() - b.date.getTime() || (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);

/**
 * @param fxNow AED per unit of a currency today, used for current market and cash values.
 */
export function computePortfolio(transactions: Tx[], quotes: Map<string, Quote>, fxNow: (currency: string) => Dec): Portfolio {
  const running = new Map<string, Running>();
  const cash = new Map<string, { accountId: string; currency: string; balance: Dec }>();
  let netContributionsBase = ZERO;
  let feesBase = ZERO;

  const addCash = (tx: Tx, change: Dec) => {
    const key = `${tx.accountId}|${tx.currency}`;
    const entry = cash.get(key) ?? { accountId: tx.accountId, currency: tx.currency, balance: ZERO };
    entry.balance = entry.balance.plus(change);
    cash.set(key, entry);
  };

  const positionFor = (tx: Tx): Running => {
    const key = `${tx.accountId}|${tx.instrumentId}`;
    let entry = running.get(key);
    if (!entry) {
      entry = { accountId: tx.accountId, instrumentId: tx.instrumentId!, currency: tx.currency, quantity: ZERO, cost: ZERO, costBase: ZERO, realisedBase: ZERO, incomeBase: ZERO, lastTradePrice: null, lastTradeDate: null };
      running.set(key, entry);
    }
    return entry;
  };

  for (const tx of [...transactions].sort(byDate)) {
    const fx = tx.fxRateToBase;
    switch (tx.type) {
      case "BUY": {
        const p = positionFor(tx);
        const spent = tx.amount.plus(tx.fees);
        p.quantity = p.quantity.plus(tx.quantity ?? ZERO);
        p.cost = p.cost.plus(spent);
        p.costBase = p.costBase.plus(spent.times(fx));
        p.lastTradePrice = tx.price;
        p.lastTradeDate = tx.date;
        addCash(tx, spent.negated());
        break;
      }
      case "SELL": {
        const p = positionFor(tx);
        const sold = tx.quantity ?? ZERO;
        if (p.quantity.lte(0) || sold.lte(0)) break;
        // Selling more than is held is treated as selling what's held.
        const share = D.min(sold, p.quantity).dividedBy(p.quantity);
        const costRemoved = p.cost.times(share);
        const costRemovedBase = p.costBase.times(share);
        const proceeds = tx.amount.minus(tx.fees);
        p.realisedBase = p.realisedBase.plus(proceeds.times(fx).minus(costRemovedBase));
        p.quantity = p.quantity.minus(D.min(sold, p.quantity));
        p.cost = p.cost.minus(costRemoved);
        p.costBase = p.costBase.minus(costRemovedBase);
        p.lastTradePrice = tx.price;
        p.lastTradeDate = tx.date;
        addCash(tx, proceeds);
        break;
      }
      case "SPLIT": {
        // The cost stays the same, spread over more (or fewer) shares.
        const p = positionFor(tx);
        const ratio = tx.quantity ?? new D(1);
        if (ratio.gt(0)) {
          p.quantity = p.quantity.times(ratio);
          if (p.lastTradePrice) p.lastTradePrice = p.lastTradePrice.dividedBy(ratio);
        }
        break;
      }
      case "DIVIDEND":
      case "INTEREST": {
        // Fees here are tax withheld, so what arrives is the amount less the fees.
        const received = tx.amount.minus(tx.fees);
        if (tx.instrumentId) {
          const p = positionFor(tx);
          p.incomeBase = p.incomeBase.plus(received.times(fx));
        }
        addCash(tx, received);
        break;
      }
      case "DEPOSIT":
        netContributionsBase = netContributionsBase.plus(tx.amount.times(fx));
        addCash(tx, tx.amount);
        break;
      case "WITHDRAWAL":
        netContributionsBase = netContributionsBase.minus(tx.amount.times(fx));
        addCash(tx, tx.amount.negated());
        break;
      case "FEE":
        feesBase = feesBase.plus(tx.amount.times(fx));
        addCash(tx, tx.amount.negated());
        break;
    }
  }

  const all: Position[] = [...running.values()].map((p) => {
    const quote = quotes.get(p.instrumentId);
    const price = quote?.price ?? p.lastTradePrice;
    const marketValueBase = price ? p.quantity.times(price).times(fxNow(quote?.currency ?? p.currency)) : ZERO;
    const unrealisedBase = p.quantity.gt(0) ? marketValueBase.minus(p.costBase) : ZERO;
    return {
      accountId: p.accountId,
      instrumentId: p.instrumentId,
      currency: p.currency,
      quantity: p.quantity,
      avgCost: p.quantity.gt(0) ? p.cost.dividedBy(p.quantity) : ZERO,
      costBasisBase: p.costBase,
      price,
      priceAsOf: quote?.asOf ?? p.lastTradeDate,
      priceFromLastTrade: !quote,
      marketValueBase,
      unrealisedBase,
      unrealisedPct: p.costBase.gt(0) && p.quantity.gt(0) ? unrealisedBase.dividedBy(p.costBase).times(100) : null,
      realisedBase: p.realisedBase,
      incomeBase: p.incomeBase,
    };
  });

  const positions = all.filter((p) => p.quantity.gt(0)).sort((a, b) => b.marketValueBase.comparedTo(a.marketValueBase));
  const closed = all.filter((p) => p.quantity.lte(0));
  const cashBalances = [...cash.values()].filter((c) => !c.balance.isZero()).map((c) => ({ ...c, balanceBase: c.balance.times(fxNow(c.currency)) }));
  const sum = (values: Dec[]) => values.reduce((total, value) => total.plus(value), ZERO);

  const marketValueBase = sum(positions.map((p) => p.marketValueBase));
  const cashBase = sum(cashBalances.map((c) => c.balanceBase));
  return {
    positions,
    closed,
    cash: cashBalances,
    totals: {
      marketValueBase,
      cashBase,
      totalBase: marketValueBase.plus(cashBase),
      costBasisBase: sum(positions.map((p) => p.costBasisBase)),
      unrealisedBase: sum(positions.map((p) => p.unrealisedBase)),
      realisedBase: sum(all.map((p) => p.realisedBase)),
      incomeBase: sum(all.map((p) => p.incomeBase)),
      feesBase,
      netContributionsBase,
    },
  };
}
