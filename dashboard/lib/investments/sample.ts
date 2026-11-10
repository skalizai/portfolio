import { USD_AED_PEG } from "@/lib/investments/fx";
import { computePortfolio, D, type Quote, type Tx, type TxType } from "@/lib/investments/holdings";

/**
 * Made-up data for "Preview with sample data", so the overview can be seen before any real
 * transactions exist. It's built in memory, never saved, and labelled as sample on screen.
 */
export function samplePortfolio(now = new Date()) {
  const accounts = [
    { id: "sample-ibkr", name: "Interactive Brokers", institution: "Interactive Brokers", currency: "USD", isActive: true },
    { id: "sample-sarwa", name: "Sarwa", institution: "Sarwa", currency: "USD", isActive: true },
  ];
  const instruments = [
    { id: "s-voo", symbol: "VOO", name: "Vanguard S&P 500 ETF", assetClass: "ETF" as const, currency: "USD" },
    { id: "s-qqq", symbol: "QQQ", name: "Invesco QQQ Trust", assetClass: "ETF" as const, currency: "USD" },
    { id: "s-msft", symbol: "MSFT", name: "Microsoft", assetClass: "STOCK" as const, currency: "USD" },
    { id: "s-aapl", symbol: "AAPL", name: "Apple", assetClass: "STOCK" as const, currency: "USD" },
    { id: "s-vwra", symbol: "VWRA", name: "Vanguard FTSE All-World", assetClass: "ETF" as const, currency: "USD" },
  ];

  const transactions: (Tx & { createdAt: Date })[] = [];
  let n = 0;
  const add = (monthsAgo: number, day: number, type: TxType, account: string, fields: { instrument?: string; qty?: number; price?: number; amount?: number; fees?: number } = {}) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day));
    if (date > now) return;
    const quantity = fields.qty ? new D(fields.qty) : null;
    const price = fields.price ? new D(fields.price) : null;
    transactions.push({
      id: `sample-${n++}`,
      accountId: account,
      instrumentId: fields.instrument ?? null,
      type,
      date,
      quantity,
      price,
      amount: quantity && price ? quantity.times(price) : new D(fields.amount ?? 0),
      fees: new D(fields.fees ?? 0),
      currency: "USD",
      fxRateToBase: USD_AED_PEG,
      createdAt: date,
    });
  };

  // A year of monthly saving, invested across a few funds and stocks.
  for (let m = 11; m >= 0; m--) {
    add(m, 2, "DEPOSIT", "sample-ibkr", { amount: 1500 + (m % 3) * 250 });
    add(m, 3, "DEPOSIT", "sample-sarwa", { amount: 600 });
    add(m, 5, "BUY", "sample-ibkr", { instrument: "s-voo", qty: 2, price: 470 + (11 - m) * 6, fees: 1 });
    if (m % 2 === 0) add(m, 6, "BUY", "sample-ibkr", { instrument: m % 4 === 0 ? "s-msft" : "s-aapl", qty: 2, price: m % 4 === 0 ? 410 + (11 - m) * 4 : 205 + (11 - m) * 2, fees: 1 });
    add(m, 7, "BUY", "sample-sarwa", { instrument: m % 3 === 0 ? "s-qqq" : "s-vwra", qty: m % 3 === 0 ? 1 : 4, price: m % 3 === 0 ? 450 + (11 - m) * 5 : 118 + (11 - m) * 0.8 });
    if (m % 3 === 1) add(m, 20, "DIVIDEND", "sample-ibkr", { instrument: "s-voo", amount: 18 + (11 - m) * 3, fees: 2.7 + (11 - m) * 0.4 });
  }
  add(4, 15, "SELL", "sample-ibkr", { instrument: "s-aapl", qty: 2, price: 228, fees: 1 });

  const quotes = new Map<string, Quote>(
    [
      ["s-voo", 552],
      ["s-qqq", 512],
      ["s-msft", 468],
      ["s-aapl", 231],
      ["s-vwra", 131],
    ].map(([id, price]) => [id as string, { price: new D(price as number), currency: "USD", asOf: now, source: "MANUAL" }]),
  );
  const portfolio = computePortfolio(transactions, quotes, () => USD_AED_PEG);
  return { accounts, instruments, transactions, portfolio };
}
