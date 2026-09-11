import {
  format,
  formatDistanceToNowStrict,
  isSameMonth,
  isSameYear,
} from "date-fns";

/**
 * Shared formatting. Previously re-inlined across Budget, Dates,
 * Accommodations and Itinerary, each with slightly different rounding.
 */

/** Currency codes the app offers, mapped to their symbol. */
const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  AUD: "A$",
  CAD: "C$",
  JPY: "¥",
};

export function currencySymbol(code?: string | null): string {
  if (!code) return "$";
  return SYMBOLS[code] ?? (code.length <= 2 ? code : `${code} `);
}

/** Money, with no trailing cents when the amount is whole. */
export function money(
  amount: number | string | null | undefined,
  currency?: string | null,
  opts: { decimals?: 0 | 2 } = {}
): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (n == null || Number.isNaN(n)) return "—";
  const decimals = opts.decimals ?? (Number.isInteger(n) ? 0 : 2);
  return `${currencySymbol(currency)}${n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Compact money for dense chips: $1.2k, $18k. */
export function moneyCompact(
  amount: number | string | null | undefined,
  currency?: string | null
): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) < 1000) return money(n, currency, { decimals: 0 });
  return `${currencySymbol(currency)}${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "12 Mar" / "12 Mar 2027" when the year differs from now. */
export function shortDate(
  value: Date | string | number | null | undefined
): string {
  if (!value) return "—";
  const d = toDate(value);
  return format(d, isSameYear(d, new Date()) ? "d MMM" : "d MMM yyyy");
}

/**
 * Collapses a range to its shortest unambiguous form:
 *   12–18 Mar · 28 Mar – 3 Apr · 28 Dec 2027 – 3 Jan 2028
 */
export function dateRange(
  start: Date | string | number | null | undefined,
  end: Date | string | number | null | undefined
): string {
  if (!start || !end) return "—";
  const a = toDate(start);
  const b = toDate(end);
  const sameYear = isSameYear(a, b);
  const thisYear = isSameYear(a, new Date()) && sameYear;

  if (sameYear && isSameMonth(a, b)) {
    return `${format(a, "d")}–${format(b, thisYear ? "d MMM" : "d MMM yyyy")}`;
  }
  return `${format(a, "d MMM")} – ${format(b, thisYear ? "d MMM" : "d MMM yyyy")}`;
}

/** Whole nights between two dates. */
export function nights(
  start: Date | string | number | null | undefined,
  end: Date | string | number | null | undefined
): number {
  if (!start || !end) return 0;
  const ms = toDate(end).getTime() - toDate(start).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** "3h ago", "2d ago". */
export function relativeTime(
  value: Date | string | number | null | undefined
): string {
  if (!value) return "";
  return `${formatDistanceToNowStrict(toDate(value))} ago`;
}

/** "Today" / "Yesterday" / "12 Mar" — for list subheads. */
export function dayBucket(value: Date | string | number): string {
  const d = toDate(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return shortDate(d);
}

/** Signed score, always with an explicit sign so it reads as a delta. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Initials for avatar fallbacks: "Priya Raman" -> "PR". */
export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? "").join("") || "?";
}
