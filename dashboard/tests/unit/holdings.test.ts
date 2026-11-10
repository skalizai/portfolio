import { describe, expect, it, vi } from "vitest";
import { rateToAed, USD_AED_PEG } from "@/lib/investments/fx";
import { computePortfolio, D, type Quote, type Tx, type TxType } from "@/lib/investments/holdings";

let n = 0;
function tx(type: TxType, date: string, fields: { qty?: string; price?: string; amount?: string; fees?: string; currency?: string; fx?: string; account?: string; instrument?: string | null } = {}): Tx {
  const quantity = fields.qty ? new D(fields.qty) : null;
  const price = fields.price ? new D(fields.price) : null;
  const amount = fields.amount ? new D(fields.amount) : quantity && price ? quantity.times(price) : new D(0);
  return {
    id: `t${n++}`,
    accountId: fields.account ?? "ibkr",
    instrumentId: fields.instrument === undefined ? (["BUY", "SELL", "SPLIT", "DIVIDEND"].includes(type) ? "AAPL" : null) : fields.instrument,
    type,
    date: new Date(`${date}T00:00:00Z`),
    quantity,
    price,
    amount,
    fees: new D(fields.fees ?? "0"),
    currency: fields.currency ?? "USD",
    fxRateToBase: new D(fields.fx ?? "3.6725"),
  };
}

const usd = () => USD_AED_PEG;
const noQuotes = new Map<string, Quote>();
const money = (value: { toFixed: (dp: number) => string }) => value.toFixed(2);

describe("computePortfolio", () => {
  it("uses weighted-average cost and realises profit on a partial sell, then carries cost through a split", () => {
    const portfolio = computePortfolio(
      [
        tx("BUY", "2026-01-05", { qty: "10", price: "100", fees: "1" }), // 1,001
        tx("BUY", "2026-02-05", { qty: "10", price: "120", fees: "1" }), // 1,201 -> 20 shares, cost 2,202
        tx("SELL", "2026-03-05", { qty: "5", price: "150", fees: "2" }), // proceeds 748, cost removed 550.50
        tx("SPLIT", "2026-04-01", { qty: "4" }), // 15 shares become 60
      ],
      new Map([["AAPL", { price: new D("40"), currency: "USD", asOf: new Date("2026-05-01"), source: "MANUAL" }]]),
      usd,
    );

    const [aapl] = portfolio.positions;
    expect(aapl!.quantity.toString()).toBe("60");
    // 2,202 x 15/20 = 1,651.50 left, over 60 shares.
    expect(money(aapl!.avgCost)).toBe("27.53");
    expect(money(aapl!.costBasisBase)).toBe(money(new D("1651.5").times(USD_AED_PEG)));
    // (748 - 550.50) in AED.
    expect(money(aapl!.realisedBase)).toBe(money(new D("197.5").times(USD_AED_PEG)));
    // 60 x 40 = 2,400 now, against 1,651.50.
    expect(money(aapl!.marketValueBase)).toBe(money(new D("2400").times(USD_AED_PEG)));
    expect(money(aapl!.unrealisedBase)).toBe(money(new D("748.5").times(USD_AED_PEG)));
    expect(aapl!.unrealisedPct!.toFixed(1)).toBe("45.3");
    expect(aapl!.priceFromLastTrade).toBe(false);
  });

  it("converts each trade at its own rate and today's value at today's rate", () => {
    const eur = (rate: string) => ({ currency: "EUR", fx: rate, instrument: "SAP" });
    const portfolio = computePortfolio(
      [tx("BUY", "2026-01-05", { qty: "10", price: "100", ...eur("4.00") }), tx("BUY", "2026-02-05", { qty: "10", price: "100", ...eur("4.20") })],
      new Map([["SAP", { price: new D("110"), currency: "EUR", asOf: new Date("2026-03-01"), source: "MANUAL" }]]),
      (currency) => (currency === "EUR" ? new D("4.10") : USD_AED_PEG),
    );
    const [sap] = portfolio.positions;
    expect(money(sap!.costBasisBase)).toBe("8200.00"); // 4,000 + 4,200
    expect(money(sap!.marketValueBase)).toBe("9020.00"); // 20 x 110 x 4.10
    expect(money(sap!.unrealisedBase)).toBe("820.00");
  });

  it("keeps cash, contributions, dividends after tax and fees per account", () => {
    const portfolio = computePortfolio(
      [
        tx("DEPOSIT", "2026-01-01", { amount: "5000", instrument: null }),
        tx("BUY", "2026-01-05", { qty: "10", price: "100", fees: "1" }),
        tx("DIVIDEND", "2026-03-01", { amount: "10", fees: "1.5" }),
        tx("FEE", "2026-03-31", { amount: "3", instrument: null }),
        tx("DEPOSIT", "2026-01-01", { amount: "2000", account: "sarwa", instrument: null }),
        tx("WITHDRAWAL", "2026-02-01", { amount: "500", account: "sarwa", instrument: null }),
      ],
      noQuotes,
      usd,
    );
    const ibkr = portfolio.cash.find((c) => c.accountId === "ibkr")!;
    expect(money(ibkr.balance)).toBe("4004.50"); // 5,000 - 1,001 + 8.50 - 3
    expect(money(portfolio.cash.find((c) => c.accountId === "sarwa")!.balance)).toBe("1500.00");
    expect(money(portfolio.totals.netContributionsBase)).toBe(money(new D("6500").times(USD_AED_PEG)));
    expect(money(portfolio.totals.incomeBase)).toBe(money(new D("8.5").times(USD_AED_PEG)));
    expect(money(portfolio.totals.feesBase)).toBe(money(new D("3").times(USD_AED_PEG)));
  });

  it("uses the last trade price when there's no quote yet, and says so", () => {
    const [position] = computePortfolio([tx("BUY", "2026-01-05", { qty: "2", price: "50" })], noQuotes, usd).positions;
    expect(position!.price!.toString()).toBe("50");
    expect(position!.priceFromLastTrade).toBe(true);
  });

  it("moves a fully sold holding to closed, keeping its realised profit", () => {
    const portfolio = computePortfolio([tx("BUY", "2026-01-05", { qty: "2", price: "50" }), tx("SELL", "2026-02-05", { qty: "2", price: "40" })], noQuotes, usd);
    expect(portfolio.positions).toHaveLength(0);
    expect(portfolio.closed).toHaveLength(1);
    expect(money(portfolio.totals.realisedBase)).toBe(money(new D("-20").times(USD_AED_PEG)));
  });

  it("holds positions in different accounts apart", () => {
    const portfolio = computePortfolio([tx("BUY", "2026-01-05", { qty: "1", price: "10" }), tx("BUY", "2026-01-05", { qty: "3", price: "10", account: "sarwa" })], noQuotes, usd);
    expect(portfolio.positions.map((p) => `${p.accountId}:${p.quantity}`).sort()).toEqual(["ibkr:1", "sarwa:3"]);
  });
});

describe("rateToAed", () => {
  it("needs no lookup for AED or US dollars", async () => {
    const fetchImpl = vi.fn();
    expect((await rateToAed("AED", new Date(), { fetchImpl }))!.toString()).toBe("1");
    expect((await rateToAed("usd", new Date(), { fetchImpl }))!.toString()).toBe("3.6725");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("converts other currencies through the dollar, caches them, and returns null when it can't", async () => {
    const store = new Map<string, InstanceType<typeof D>>();
    const cache = { get: async (key: string) => store.get(key) ?? null, set: async (key: string, rate: InstanceType<typeof D>) => void store.set(key, rate) };
    const fetchImpl = vi.fn(async () => Response.json({ rates: { USD: 1.1 } }));
    const day = new Date("2026-03-02");
    expect((await rateToAed("EUR", day, { fetchImpl, cache }))!.toFixed(5)).toBe("4.03975");
    await rateToAed("EUR", day, { fetchImpl, cache });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    expect(await rateToAed("GBP", day, { fetchImpl: vi.fn(async () => new Response("", { status: 500 })) })).toBeNull();
    expect(await rateToAed("not a code", day)).toBeNull();
  });
});
