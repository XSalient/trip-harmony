/**
 * Turning what somebody wrote in My Preferences into things the group can
 * decide on.
 *
 * The preferences form is four free-text boxes, and it was a dead end: it fed
 * AI match scoring and nothing else. Somebody who wrote "we can do about
 * £1,200 a family" had stated the single most contested number on the trip in
 * a place nobody votes on, and would never be asked about it again.
 *
 * This finds those statements. It does **not** act on them — a suggestion is
 * shown to the person who wrote it, and becomes a proposal only when they say
 * so. Creating a proposal notifies the whole trip and casts a vote; doing that
 * because somebody edited a textarea would be a way to lose the trip's
 * attention, not to keep it.
 *
 * **Deterministic on purpose, and conservative.** No model runs when Save is
 * pressed — see ADR 0011 and `aiLimits.test.ts`: AI on this app runs because
 * a person asked it to. Money and dates parse reliably from prose; a missed
 * suggestion costs nothing, and a wrong one costs the trust that makes anybody
 * read the next one. Place names do not parse reliably at all, which is why
 * they are absent here rather than guessed.
 */
import type { BudgetScope } from "./budget.js";

export const PREF_FIELDS = [
  "mustHaves",
  "strongPreferences",
  "avoids",
  "openComments",
] as const;
export type PrefField = (typeof PREF_FIELDS)[number];

export type SuggestionKind = "date" | "budget";

type Base = {
  /**
   * Identity, used to suppress a suggestion that is already a proposal or has
   * already been dismissed. Built from the same normalisation the existing
   * duplicate checks use, so accepting one is what makes it stop coming back.
   */
  fingerprint: string;
  /** Which box it came from, and the words themselves. */
  source: PrefField | "cap";
  excerpt: string;
};

export type BudgetSuggestion = Base & {
  kind: "budget";
  amount: string;
  currency: string;
  scope: BudgetScope;
  title: string;
};

export type DateSuggestion = Base & {
  kind: "date";
  startDate: string;
  endDate: string;
  label: string;
};

export type Suggestion = BudgetSuggestion | DateSuggestion;

/** Matches `dates.propose`'s own normalisation, so the two agree on identity. */
export const normalizeDate = (d: string | Date) =>
  new Date(d).toISOString().split("T")[0];

export function budgetFingerprint(amount: string, scope: BudgetScope) {
  return `budget:${Number(amount).toFixed(2)}:${scope}`;
}

export function dateFingerprint(start: string | Date, end: string | Date) {
  return `date:${normalizeDate(start)}:${normalizeDate(end)}`;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/**
 * Words near a figure that say what it is a figure *for*.
 *
 * Order matters: "per person" must be tested before "person", and "each" is
 * last because it is the weakest signal.
 */
function scopeFrom(text: string): BudgetScope {
  const t = text.toLowerCase();
  if (/\bper (family|household|group)\b|\ba (family|household)\b/.test(t))
    return "per_group";
  if (/\bper adult\b/.test(t)) return "per_adult";
  if (/\bper (person|head)\b|\beach\b|\bpp\b|\ba head\b/.test(t))
    return "per_person";
  return "trip_total";
}

const CURRENCY_SIGNS: Record<string, string> = {
  "£": "GBP",
  $: "USD",
  "€": "EUR",
  "₹": "INR",
  "¥": "JPY",
};

/**
 * Money in a sentence.
 *
 * A figure only counts as money when it is marked as money — a symbol, a
 * three-letter code, or an explicit "budget"/"spend" nearby. "No more than 10
 * stairs" and "minimum 3 bathrooms" are numbers in the same boxes, and turning
 * either into a budget proposal is exactly the wrong-suggestion cost this
 * whole module is shaped around avoiding.
 */
function detectBudgets(
  field: PrefField,
  text: string,
  fallbackCurrency: string
): BudgetSuggestion[] {
  const out: BudgetSuggestion[] = [];
  const seen = new Set<string>();

  // Two passes rather than one alternation, because they need different
  // flags: the currency code is case-sensitive (`EUR`, never `eur` — and a
  // case-insensitive [A-Z]{3} matches "the 1500" and every other word), while
  // the keyword that marks a bare figure as money is not ("Budget is around
  // 1500" is how anybody actually writes it).
  const marked =
    /([£$€₹¥])\s?([\d,]+(?:\.\d{1,2})?)|\b([A-Z]{3})\s?([\d,]+(?:\.\d{1,2})?)\b/g;
  const keyworded =
    /\b(?:budget|spend|spending|cost|costs|pay|paying)\b[^.\n]{0,24}?\b([\d,]{3,}(?:\.\d{1,2})?)\b/gi;

  const add = (
    raw: string,
    sign: string | undefined,
    code: string | undefined,
    at: number,
    len: number
  ) => {
    const amount = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const currency = sign
      ? CURRENCY_SIGNS[sign]
      : (code ?? (fallbackCurrency || "USD"));

    // The clause it sits in, so "per family" three words later still counts.
    const from = Math.max(0, at - 40);
    const clause = text.slice(from, at + len + 40);
    const scope = scopeFrom(clause);
    const fingerprint = budgetFingerprint(amount.toFixed(2), scope);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);

    out.push({
      kind: "budget",
      fingerprint,
      source: field,
      excerpt: sentenceAround(text, at),
      amount: amount.toFixed(2),
      currency,
      scope,
      title: "From my preferences",
    });
  };

  for (const m of text.matchAll(marked)) {
    const raw = m[2] ?? m[4];
    if (raw) add(raw, m[1], m[3], m.index!, m[0].length);
  }
  for (const m of text.matchAll(keyworded)) {
    if (m[1]) add(m[1], undefined, undefined, m.index!, m[0].length);
  }

  return out;
}

/** The sentence a match sits in, trimmed — what the card quotes back. */
function sentenceAround(text: string, at: number): string {
  const start = Math.max(
    text.lastIndexOf(".", at) + 1,
    text.lastIndexOf("\n", at) + 1
  );
  let end = text.length;
  for (const stop of [".", "\n"]) {
    const i = text.indexOf(stop, at);
    if (i !== -1 && i < end) end = i;
  }
  const s = text.slice(start, end).trim();
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * Dates in a sentence — only where they are unambiguous.
 *
 * An explicit range ("12–19 September", "2027-03-01 to 2027-03-08") and a bare
 * month ("we're free in May") are the two forms people actually write in these
 * boxes. Anything vaguer belongs to the model, behind the button.
 */
function detectDates(
  field: PrefField,
  text: string,
  today: Date
): DateSuggestion[] {
  const out: DateSuggestion[] = [];
  const seen = new Set<string>();
  const push = (
    startDate: string,
    endDate: string,
    label: string,
    at: number
  ) => {
    const fingerprint = dateFingerprint(startDate, endDate);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    out.push({
      kind: "date",
      fingerprint,
      source: field,
      excerpt: sentenceAround(text, at),
      startDate,
      endDate,
      label,
    });
  };

  const monthNames = MONTHS.join("|");

  // "12-19 September", "12 to 19 Sept 2027"
  const dayRange = new RegExp(
    `\\b(\\d{1,2})\\s*(?:-|–|—|to|until|till)\\s*(\\d{1,2})\\s+(${monthNames})[a-z]*\\.?\\s*(\\d{4})?`,
    "gi"
  );
  for (const m of text.matchAll(dayRange)) {
    const month = MONTHS.indexOf(m[3].toLowerCase()) + 1;
    const year = m[4] ? Number(m[4]) : yearFor(month, today);
    const d1 = Number(m[1]);
    const d2 = Number(m[2]);
    if (d1 < 1 || d2 < 1 || d1 > 31 || d2 > 31 || d2 < d1) continue;
    push(
      iso(year, month, d1),
      iso(year, month, d2),
      `${d1}–${d2} ${titleCase(m[3])}`,
      m.index!
    );
  }

  // "2027-03-01 to 2027-03-08"
  const isoRange =
    /\b(\d{4}-\d{2}-\d{2})\s*(?:-|–|—|to|until|till)\s*(\d{4}-\d{2}-\d{2})\b/g;
  for (const m of text.matchAll(isoRange)) {
    if (m[2] < m[1]) continue;
    push(m[1], m[2], `${m[1]} → ${m[2]}`, m.index!);
  }

  // "free in May", "anytime in September 2027" — the whole month.
  const bareMonth = new RegExp(
    `\\b(?:in|during|over|for)\\s+(${monthNames})\\b\\s*(\\d{4})?`,
    "gi"
  );
  for (const m of text.matchAll(bareMonth)) {
    const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    const year = m[2] ? Number(m[2]) : yearFor(month, today);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    push(
      iso(year, month, 1),
      iso(year, month, last),
      `All of ${titleCase(m[1])} ${year}`,
      m.index!
    );
  }

  return out;
}

/** A month with no year means the next one that has not happened yet. */
function yearFor(month: number, today: Date): number {
  const y = today.getUTCFullYear();
  return month < today.getUTCMonth() + 1 ? y + 1 : y;
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export type PrefFields = Record<PrefField, string>;

/**
 * Everything worth offering from what somebody wrote.
 *
 * **Avoids is never read.** "Nothing over £2,000" in a dealbreakers box is a
 * limit, not a proposal, and offering to propose it to the group inverts what
 * the person said.
 */
export function detectSuggestions(
  fields: Partial<PrefFields>,
  ctx: { today?: Date; currency?: string }
): Suggestion[] {
  const today = ctx.today ?? new Date();
  const currency = ctx.currency || "USD";
  const out: Suggestion[] = [];
  for (const field of PREF_FIELDS) {
    if (field === "avoids") continue;
    const text = fields[field];
    if (!text?.trim()) continue;
    out.push(...detectBudgets(field, text, currency));
    out.push(...detectDates(field, text, today));
  }
  return dedupe(out);
}

/**
 * The private cap, offered as a public proposal.
 *
 * The cap itself stays private and stays a cap — this is the separate act of
 * saying it out loud. The scope defaults to what the number most likely meant:
 * somebody in a family wrote a family's figure.
 */
export function capSuggestion(
  cap: string | null | undefined,
  ctx: { currency?: string; inGroup?: boolean }
): BudgetSuggestion | null {
  const amount = Number(cap);
  if (!cap || !Number.isFinite(amount) || amount <= 0) return null;
  const scope: BudgetScope = ctx.inGroup ? "per_group" : "per_person";
  return {
    kind: "budget",
    fingerprint: budgetFingerprint(amount.toFixed(2), scope),
    source: "cap",
    excerpt:
      `Your budget cap is ${ctx.currency || ""} ${amount.toFixed(0)}`.trim(),
    amount: amount.toFixed(2),
    currency: ctx.currency || "USD",
    scope,
    title: "From my budget cap",
  };
}

function dedupe(suggestions: Suggestion[]): Suggestion[] {
  const seen = new Set<string>();
  return suggestions.filter(s => {
    if (seen.has(s.fingerprint)) return false;
    seen.add(s.fingerprint);
    return true;
  });
}

/**
 * Drops the suggestions that should not be offered again.
 *
 * Two reasons, and only one of them needs storing. A suggestion that has
 * *become* a proposal is suppressed because its fingerprint is now among the
 * trip's — accepting needs no record of its own. A suggestion somebody said no
 * to does need one, or the same card returns every time they press Save, and a
 * helpful prompt becomes something to dismiss without reading.
 */
export function suppress(
  suggestions: Suggestion[],
  existingFingerprints: Iterable<string>,
  dismissed: Iterable<string>
): Suggestion[] {
  const gone = new Set([...existingFingerprints, ...dismissed]);
  return suggestions.filter(s => !gone.has(s.fingerprint));
}
