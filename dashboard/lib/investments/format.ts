import type { Dec } from "@/lib/investments/holdings";

const aedFormat = new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 6 });

/** AED, such as "AED 1,234.56". */
export const aed = (value: Dec) => aedFormat.format(Number(value.toFixed(2)));

/** A gain or loss, never shown by colour alone: "▲ +AED 12.30" or "▼ −AED 5.00". */
export function signedAed(value: Dec): string {
  if (value.isZero()) return aed(value);
  const text = aed(value.abs());
  return value.gt(0) ? `▲ +${text}` : `▼ −${text}`;
}

export function signedPct(value: Dec | null): string {
  if (!value) return "–";
  if (value.isZero()) return "0.0%";
  return `${value.gt(0) ? "▲ +" : "▼ −"}${value.abs().toFixed(1)}%`;
}

/** A plain number, such as a share count or a price, without trailing zeros. */
export const plain = (value: Dec | null | undefined) => (value ? numberFormat.format(Number(value.toFixed(6))) : "–");

/** Text colour for a gain or loss. Always used alongside the arrow and sign. */
export const tone = (value: Dec) => (value.gt(0) ? "text-gain" : value.lt(0) ? "text-loss" : "");
