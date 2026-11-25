import { Prisma } from "@/lib/generated/prisma/client";

/** Money for Household & Family: Decimal throughout, rounded to 2 places (fils and paisa). */
export const D = Prisma.Decimal;
export type Dec = Prisma.Decimal;
export const ZERO = new D(0);
/** A Decimal, or a number or string that reads as one. */
export type Num = Dec | string | number;

/** Rounds half away from zero, the way amounts are rounded on a payslip or receipt. */
export const round2 = (value: Num) => new D(value).toDecimalPlaces(2, D.ROUND_HALF_UP);

/** PKR received for an AED amount at a rate given as PKR per 1 AED. */
export function pkrFromAed(aed: Num, pkrPerAed: Num): Dec {
  return round2(new D(aed).times(pkrPerAed));
}

/** AED for a PKR amount at a rate given as PKR per 1 AED. */
export function aedFromPkr(pkr: Num, pkrPerAed: Num): Dec {
  const rate = new D(pkrPerAed);
  if (rate.lte(0)) throw new Error("The exchange rate must be above zero.");
  return round2(new D(pkr).dividedBy(rate));
}

/** The rate actually achieved on a transfer, as PKR per 1 AED, to 4 places. */
export function achievedRate(aed: Num, pkr: Num): Dec | null {
  const sent = new D(aed);
  return sent.gt(0) ? new D(pkr).dividedBy(sent).toDecimalPlaces(4, D.ROUND_HALF_UP) : null;
}

export const sum = (values: Num[]) => values.reduce<Dec>((total, value) => total.plus(value), ZERO);

/** "2026-11" for a date, in UTC. */
export const monthOf = (date: Date) => date.toISOString().slice(0, 7);

/** The first day of a "YYYY-MM" month, and the first day of the month after it. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return { start: new Date(Date.UTC(year, m - 1, 1)), end: new Date(Date.UTC(year, m, 1)) };
}

/** The month a number of months after (or before, if negative) a "YYYY-MM" month. */
export function addMonths(month: string, count: number): string {
  const { start } = monthRange(month);
  return monthOf(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + count, 1)));
}

export const isMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

const aedFormat = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Whole rupees are shown without decimals, and paisa only when there are any.
const pkrFormat = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatAed = (value: Num) => aedFormat.format(Number(new D(value).toFixed(2)));
export const formatPkr = (value: Num) => pkrFormat.format(Number(new D(value).toFixed(2)));

/** Shows only the last 4 characters of an ID or IBAN in lists, such as "•••• 4521". */
export function mask(value: string | null | undefined): string {
  const clean = (value ?? "").replace(/\s+/g, "");
  if (!clean) return "–";
  return clean.length <= 4 ? clean : `•••• ${clean.slice(-4)}`;
}
