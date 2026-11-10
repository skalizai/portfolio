import { z } from "zod";
import { db } from "@/lib/db";
import { BASE_CURRENCY, rateToAed } from "@/lib/investments/fx";
import { computePortfolio, D, type Dec, type Quote } from "@/lib/investments/holdings";

const decimal = (label: string) =>
  z
    .string({ error: `Enter ${label}` })
    .trim()
    .regex(/^\d+(\.\d+)?$/, `${label[0]!.toUpperCase()}${label.slice(1)} must be a number, like 12.5`);
const currency = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code, like USD"));

export const AccountInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(100),
  institution: z.string().trim().min(1, "Enter the broker or bank").max(100),
  type: z.enum(["BROKERAGE", "BANK", "OTHER"]).default("BROKERAGE"),
  currency: currency.default("USD"),
  notes: z.string().trim().max(500).optional(),
});

const TRADE = ["BUY", "SELL"] as const;
const NEEDS_INSTRUMENT = ["BUY", "SELL", "SPLIT", "DIVIDEND"] as const;

export const TransactionInputSchema = z
  .object({
    accountId: z.string().min(1, "Choose an account"),
    type: z.enum(["BUY", "SELL", "DIVIDEND", "INTEREST", "DEPOSIT", "WITHDRAWAL", "FEE", "SPLIT"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date"),
    symbol: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().max(20).regex(/^[A-Z0-9.\-]*$/, "Symbols use letters, numbers, dots and dashes"))
      .optional(),
    instrumentName: z.string().trim().max(200).optional(),
    assetClass: z.enum(["STOCK", "ETF", "OTHER"]).optional(),
    quantity: decimal("a quantity").optional(),
    price: decimal("a price").optional(),
    amount: decimal("an amount").optional(),
    fees: decimal("the fees").optional(),
    currency,
    fxRateToBase: decimal("an exchange rate").optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((input, ctx) => {
    if ((NEEDS_INSTRUMENT as readonly string[]).includes(input.type) && !input.symbol) ctx.addIssue({ code: "custom", path: ["symbol"], message: "Enter the symbol, like AAPL or VOO" });
    if ((TRADE as readonly string[]).includes(input.type) && (!input.quantity || !input.price)) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Enter the number of shares and the price" });
    if (input.type === "SPLIT" && !input.quantity) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Enter the split ratio, like 4 for a 4-for-1 split" });
    if (!(TRADE as readonly string[]).includes(input.type) && input.type !== "SPLIT" && !input.amount) ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter the amount" });
    if (new Date(`${input.date}T00:00:00Z`).getTime() > Date.now() + 86_400_000) ctx.addIssue({ code: "custom", path: ["date"], message: "The date can't be in the future" });
  });

export type TransactionInput = z.infer<typeof TransactionInputSchema>;

export const PriceInputSchema = z.object({
  instrumentId: z.string().min(1),
  price: decimal("a price"),
});

const fxCache = {
  get: async (key: string) => {
    const [quote, day] = key.split("|");
    const row = await db().fxRate.findUnique({ where: { base_quote_asOf: { base: BASE_CURRENCY, quote: quote!, asOf: new Date(`${day}T00:00:00Z`) } } });
    return row ? new D(row.rate) : null;
  },
  set: async (key: string, rate: Dec) => {
    const [quote, day] = key.split("|");
    await db().fxRate.upsert({
      where: { base_quote_asOf: { base: BASE_CURRENCY, quote: quote!, asOf: new Date(`${day}T00:00:00Z`) } },
      create: { base: BASE_CURRENCY, quote: quote!, asOf: new Date(`${day}T00:00:00Z`), rate },
      update: { rate },
    });
  },
};

export async function createAccount(input: z.infer<typeof AccountInputSchema>) {
  return db().account.create({ data: input });
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string; status: number };

/** Saves one transaction, adding the stock or ETF the first time its symbol is used. */
export async function createTransaction(input: TransactionInput): Promise<SaveResult> {
  const account = await db().account.findUnique({ where: { id: input.accountId }, select: { id: true } });
  if (!account) return { ok: false, error: "That account doesn't exist.", status: 404 };

  const date = new Date(`${input.date}T00:00:00Z`);
  const fx = input.fxRateToBase ? new D(input.fxRateToBase) : await rateToAed(input.currency, date, { cache: fxCache });
  if (!fx) return { ok: false, error: `Couldn't find the ${input.currency} to AED rate for that date. Enter it yourself under "AED per ${input.currency}".`, status: 422 };

  let instrumentId: string | null = null;
  if (input.symbol) {
    const instrument = await db().instrument.upsert({
      where: { symbol: input.symbol },
      create: { symbol: input.symbol, name: input.instrumentName || input.symbol, assetClass: input.assetClass ?? "STOCK", currency: input.currency },
      update: {},
      select: { id: true },
    });
    instrumentId = instrument.id;
  }

  const quantity = input.quantity ? new D(input.quantity) : null;
  const price = input.price ? new D(input.price) : null;
  // For a trade, the amount is always shares times price, so the two can't disagree.
  const amount = quantity && price && (input.type === "BUY" || input.type === "SELL") ? quantity.times(price) : new D(input.amount ?? "0");

  const created = await db().transaction.create({
    data: {
      accountId: input.accountId,
      instrumentId,
      type: input.type,
      date,
      quantity,
      price,
      amount,
      fees: new D(input.fees ?? "0"),
      currency: input.currency,
      fxRateToBase: fx,
      notes: input.notes || null,
    },
    select: { id: true },
  });
  await db().auditLog.create({ data: { action: "investments.transaction_added", payload: { type: input.type } } });
  return { ok: true, id: created.id };
}

export async function setManualPrice(instrumentId: string, price: string) {
  const instrument = await db().instrument.findUnique({ where: { id: instrumentId }, select: { currency: true } });
  if (!instrument) return null;
  return db().priceQuote.create({ data: { instrumentId, price: new D(price), currency: instrument.currency, asOf: new Date(), source: "MANUAL" } });
}

/** Everything the investment pages show, in AED. */
export async function getPortfolio() {
  const [accounts, instruments, transactions, quotes] = await Promise.all([
    db().account.findMany({ orderBy: { createdAt: "asc" } }),
    db().instrument.findMany({ orderBy: { symbol: "asc" } }),
    db().transaction.findMany({ orderBy: [{ date: "desc" }, { createdAt: "desc" }], include: { instrument: { select: { symbol: true } } } }),
    db().priceQuote.findMany({ orderBy: { asOf: "desc" }, distinct: ["instrumentId"] }),
  ]);

  const latest = new Map<string, Quote>(quotes.map((q) => [q.instrumentId, { price: new D(q.price), currency: q.currency, asOf: q.asOf, source: q.source }]));
  const today = new Date();
  const currencies = [...new Set([...transactions.map((t) => t.currency), ...quotes.map((q) => q.currency)])];
  const rates = new Map<string, Dec>();
  for (const code of currencies) {
    // Today's rate for current values; the most recent stored one if today's can't be fetched.
    const rate = (await rateToAed(code, today, { cache: fxCache })) ?? (await db().fxRate.findFirst({ where: { quote: code }, orderBy: { asOf: "desc" } }).then((row) => (row ? new D(row.rate) : null)));
    if (rate) rates.set(code, rate);
  }
  const missingRates = currencies.filter((code) => !rates.has(code));

  const txs = transactions.map((t) => ({
    ...t,
    quantity: t.quantity ? new D(t.quantity) : null,
    price: t.price ? new D(t.price) : null,
    amount: new D(t.amount),
    fees: new D(t.fees),
    fxRateToBase: new D(t.fxRateToBase),
  }));
  const portfolio = computePortfolio(
    txs,
    latest,
    (code) => rates.get(code) ?? new D(0),
  );

  return { accounts, instruments, transactions, txs, portfolio, missingRates };
}

export type PortfolioView = Awaited<ReturnType<typeof getPortfolio>>;
