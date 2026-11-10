import { D, type Dec } from "@/lib/investments/holdings";

export const BASE_CURRENCY = "AED";
/** The dirham is pegged to the US dollar at this rate. */
export const USD_AED_PEG = new D("3.6725");

/**
 * AED per one unit of a currency on a date. AED and USD need no lookup. Others come from the
 * free Frankfurter service (European Central Bank rates) through the US dollar, and are cached so
 * each date is fetched once. Returns null when the rate can't be found, so the caller can ask.
 */
export async function rateToAed(
  currency: string,
  date: Date,
  options: { fetchImpl?: typeof fetch; cache?: { get: (key: string) => Promise<Dec | null>; set: (key: string, rate: Dec) => Promise<void> } } = {},
): Promise<Dec | null> {
  const code = currency.trim().toUpperCase();
  if (code === BASE_CURRENCY) return new D(1);
  if (code === "USD") return USD_AED_PEG;
  if (!/^[A-Z]{3}$/.test(code)) return null;

  const day = date.toISOString().slice(0, 10);
  const key = `${code}|${day}`;
  const cached = await options.cache?.get(key);
  if (cached) return cached;

  try {
    const response = await (options.fetchImpl ?? fetch)(`https://api.frankfurter.app/${day}?from=${code}&to=USD`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { rates?: { USD?: number } };
    const usd = body.rates?.USD;
    if (typeof usd !== "number" || !(usd > 0)) return null;
    const rate = new D(usd).times(USD_AED_PEG);
    await options.cache?.set(key, rate);
    return rate;
  } catch {
    return null;
  }
}
