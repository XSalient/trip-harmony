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
 * last because it is the weakest signal. `pp` is tested with and without a
 * space in front of it, because "£1200pp" is how it is actually typed and
 * `\bpp\b` does not see a boundary between a digit and a letter.
 */
function scopeFrom(text: string): BudgetScope {
  const t = text.toLowerCase();
  if (/\bper (family|household|group)\b|\ba (family|household)\b/.test(t))
    return "per_group";
  if (/\bper adult\b/.test(t)) return "per_adult";
  if (/\bper (person|head)\b|\beach\b|\bpp\b|\d\s*pp\b|\ba head\b/.test(t))
    return "per_person";
  return "trip_total";
}

/**
 * A figure the scope enum cannot hold.
 *
 * "£150 a night" is a real budget statement, and there is no nightly scope —
 * proposing it as a trip total says something the person did not say, which is
 * the one failure this module is shaped around avoiding. So it is dropped
 * until there is a scope for it.
 */
const PER_PERIOD = /\b(?:per|a|each|\/)\s?(?:night|nite|day|week|month)\b/i;

const CURRENCY_SIGNS: Record<string, string> = {
  "£": "GBP",
  $: "USD",
  "€": "EUR",
  "₹": "INR",
  "¥": "JPY",
};

/**
 * Currency codes, as a closed list.
 *
 * A bare `[A-Z]{3}` next to a number is not a currency code — it is any
 * three-letter word somebody shouted. "WE ARE FREE IN MAY 2027" proposed a
 * budget of 2027 MAY, and "flight ref ABC 1234" a budget of 1234 ABC. Both
 * reach the whole group under the writer's name, so the token has to be a
 * currency before the number beside it is money.
 */
const CURRENCY_CODES = new Set([
  "AED",
  "ARS",
  "AUD",
  "BGN",
  "BRL",
  "CAD",
  "CHF",
  "CLP",
  "CNY",
  "COP",
  "CZK",
  "DKK",
  "EGP",
  "EUR",
  "GBP",
  "HKD",
  "HRK",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "ISK",
  "JPY",
  "KRW",
  "LKR",
  "MAD",
  "MXN",
  "MYR",
  "NOK",
  "NZD",
  "PEN",
  "PHP",
  "PKR",
  "PLN",
  "RON",
  "SAR",
  "SEK",
  "SGD",
  "THB",
  "TRY",
  "TWD",
  "USD",
  "VND",
  "ZAR",
]);

/** What people write instead of a code. "1,200 euros" is not rare prose. */
const CURRENCY_WORDS: Record<string, string> = {
  pound: "GBP",
  pounds: "GBP",
  quid: "GBP",
  sterling: "GBP",
  gbp: "GBP",
  euro: "EUR",
  euros: "EUR",
  dollar: "USD",
  dollars: "USD",
  bucks: "USD",
  usd: "USD",
  rupee: "INR",
  rupees: "INR",
  yen: "JPY",
};

/** The token beside a figure, as a currency — or nothing, and then it is not money. */
function currencyOf(token: string | undefined): string | null {
  if (!token) return null;
  const upper = token.toUpperCase();
  if (CURRENCY_CODES.has(upper)) return upper;
  return CURRENCY_WORDS[token.toLowerCase()] ?? null;
}

/**
 * Nouns a figure can be counted in that are not money.
 *
 * Only consulted for the keyword pass, where the figure carries no currency of
 * its own: "budget for 10 people" is a headcount sitting next to the word
 * budget, and proposing £10 to the group is the failure this module avoids.
 */
const NOT_MONEY_UNITS =
  /^\s*(?:people|persons?|adults?|kids?|children|guests?|nights?|days?|weeks?|months?|years?|bedrooms?|bathrooms?|rooms?|beds?|stairs?|steps?|hours?|mins?|minutes?|miles?|km|kg)\b/i;

const FIGURE = String.raw`\d[\d,]*(?:\.\d{1,2})?`;

/**
 * Money in a sentence.
 *
 * A figure only counts as money when it is marked as money — a symbol, a real
 * currency code or word on either side of it, or an explicit "budget"/"spend"
 * nearby. "No more than 10 stairs" and "minimum 3 bathrooms" are numbers in
 * the same boxes, and turning either into a budget proposal is exactly the
 * wrong-suggestion cost this whole module is shaped around avoiding.
 */
function detectBudgets(
  field: PrefField,
  text: string,
  fallbackCurrency: string
): BudgetSuggestion[] {
  const out: BudgetSuggestion[] = [];
  const seen = new Set<string>();

  // Four passes rather than one alternation, because a currency can sit before
  // a figure, after it, or nowhere at all. Each is case-insensitive: the codes
  // are checked against `CURRENCY_CODES`, so "eur 1500" is safe to read where
  // a bare `[A-Z]{3}` was not.
  const signed = new RegExp(String.raw`([£$€₹¥])\s?(${FIGURE})`, "g");
  const codeBefore = new RegExp(
    String.raw`\b([A-Za-z]{3,8})\s?(${FIGURE})\b`,
    "gi"
  );
  const codeAfter = new RegExp(
    String.raw`\b(${FIGURE})\s?([A-Za-z]{3,8})\b`,
    "gi"
  );
  // A bare figure marked only by the scope glued to it: "1200pp", "1500 per
  // person". Three digits at least, because "3 per family" is a count.
  const scoped = new RegExp(
    String.raw`\b(\d[\d,]{2,}(?:\.\d{1,2})?)\s?(?:pp\b|per\s+(?:person|head|adult|family|household)\b)`,
    "gi"
  );
  const keyworded = new RegExp(
    String.raw`\b(?:budget|budgets|spend|spending|cost|costs|pay|paying)\b[^.\n]{0,24}?\b(${FIGURE})\b`,
    "gi"
  );

  const add = (raw: string, currency: string, at: number, len: number) => {
    const amount = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return;

    // The clause it sits in, so "per family" three words later still counts.
    const from = Math.max(0, at - 40);
    const after = text.slice(at + len, at + len + 40);
    const clause = text.slice(from, at + len + 40);
    // "£150 a night" has no scope to be proposed in — see `PER_PERIOD`.
    if (PER_PERIOD.test(after)) return;
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

  const fallback = fallbackCurrency || "USD";

  for (const m of text.matchAll(signed)) {
    add(m[2], CURRENCY_SIGNS[m[1]] ?? fallback, m.index!, m[0].length);
  }
  for (const m of text.matchAll(codeBefore)) {
    const currency = currencyOf(m[1]);
    if (currency) add(m[2], currency, m.index!, m[0].length);
  }
  for (const m of text.matchAll(codeAfter)) {
    const currency = currencyOf(m[2]);
    if (currency) add(m[1], currency, m.index!, m[0].length);
  }
  for (const m of text.matchAll(scoped)) {
    add(m[1], fallback, m.index!, m[0].length);
  }
  for (const m of text.matchAll(keyworded)) {
    const digits = m[1].replace(/[^\d]/g, "");
    const rest = text.slice(m.index! + m[0].length);
    // A figure with no currency on it needs to be big enough to be a budget,
    // or to say what it is a share of. "budget of 90 per person" is money;
    // "budget for 10 people" is a headcount.
    const scopedEnough = /^\s*(?:pp\b|per\s|each\b|a head\b)/i.test(rest);
    if (digits.length < 3 && !scopedEnough) continue;
    if (NOT_MONEY_UNITS.test(rest)) continue;
    add(m[1], fallback, m.index!, m[0].length);
  }

  return out;
}

/**
 * The sentence a match sits in, trimmed — what the card quotes back.
 *
 * A full stop only ends a sentence when it is not sitting between two digits:
 * quoting "we could do £1,200" back at somebody who wrote "£1,200.50 a family"
 * is a misquote, and the quote is the whole reason the card can be trusted.
 */
function sentenceAround(text: string, at: number): string {
  const isBreak = (i: number) =>
    text[i] === "\n" ||
    (text[i] === "." &&
      !(/\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 1] ?? "")));

  let start = 0;
  for (let i = at - 1; i >= 0; i--) {
    if (isBreak(i)) {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = at; i < text.length; i++) {
    if (isBreak(i)) {
      end = i;
      break;
    }
  }
  const s = text.slice(start, end).trim();
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/**
 * Month names as people write them: full, or the three-letter short form with
 * whatever they added to it ("Sep", "Sept", "Sept."). The three-letter prefix
 * is what the match is resolved by.
 */
const MONTH_PATTERN = MONTHS.map(
  m => `${m.slice(0, 3)}(?:${m.slice(3)}|t)?`
).join("|");

/** 1–12 from whatever form of the name was written, or 0 if it is not one. */
function monthOf(written: string): number {
  const key = written.toLowerCase().replace(/\.$/, "").slice(0, 3);
  return MONTHS.findIndex(m => m.startsWith(key)) + 1;
}

/** Days in a month, so "31 September" is refused rather than rolled forward. */
function daysIn(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const ORDINAL = String.raw`(?:st|nd|rd|th)?`;
const RANGE_SEP = String.raw`\s*(?:-|–|—|to|until|till|through|thru)\s*`;

/**
 * Dates in a sentence — only where they are unambiguous.
 *
 * An explicit range ("12–19 September", "Sept 12-19", "2027-03-01 to
 * 2027-03-08") and a bare month ("we're free in May") are the forms people
 * actually write in these boxes. Anything vaguer belongs to the model, behind
 * the button.
 *
 * A range that has already been and gone is not offered: nobody proposes last
 * March, and the group cannot vote on it.
 */
function detectDates(
  field: PrefField,
  text: string,
  today: Date
): DateSuggestion[] {
  const out: DateSuggestion[] = [];
  const seen = new Set<string>();
  const todayIso = normalizeDate(today);
  // Where an explicit range has already been read. "12–19 September 2027" is
  // one answer, and offering "all of September" beside it is the same
  // sentence read twice.
  const consumed: Array<[number, number]> = [];
  const inRange = (at: number) =>
    consumed.some(([from, to]) => at >= from && at < to);
  const push = (
    startDate: string,
    endDate: string,
    label: string,
    at: number
  ) => {
    if (endDate < todayIso) return;
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

  /** One "d–d of month" reading, wherever the month sat in the sentence. */
  const pushDayRange = (
    written: string,
    d1: number,
    d2: number,
    yearText: string | undefined,
    at: number
  ) => {
    const month = monthOf(written);
    if (month < 1) return;
    const year = yearText ? Number(yearText) : yearFor(month, today);
    if (d1 < 1 || d2 < 1 || d2 < d1 || d2 > daysIn(year, month)) return;
    push(
      iso(year, month, d1),
      iso(year, month, d2),
      `${d1}–${d2} ${titleCase(MONTHS[month - 1])} ${year}`,
      at
    );
  };

  // "12-19 September", "12th to 19th Sept 2027"
  const dayFirst = new RegExp(
    String.raw`\b(\d{1,2})${ORDINAL}${RANGE_SEP}(\d{1,2})${ORDINAL}\s+(?:of\s+)?(${MONTH_PATTERN})\.?\s*,?\s*(\d{4})?`,
    "gi"
  );
  for (const m of text.matchAll(dayFirst)) {
    consumed.push([m.index!, m.index! + m[0].length]);
    pushDayRange(m[3], Number(m[1]), Number(m[2]), m[4], m.index!);
  }

  // "September 12-19", "Sept 12th–19th 2027" — the same range, written round
  // the other way, which is how half of everybody writes it.
  const monthFirst = new RegExp(
    String.raw`\b(${MONTH_PATTERN})\.?\s+(\d{1,2})${ORDINAL}${RANGE_SEP}(\d{1,2})${ORDINAL}\s*,?\s*(\d{4})?`,
    "gi"
  );
  for (const m of text.matchAll(monthFirst)) {
    consumed.push([m.index!, m.index! + m[0].length]);
    pushDayRange(m[1], Number(m[2]), Number(m[3]), m[4], m.index!);
  }

  // "2027-03-01 to 2027-03-08"
  const isoRange = new RegExp(
    String.raw`\b(\d{4}-\d{2}-\d{2})${RANGE_SEP}(\d{4}-\d{2}-\d{2})\b`,
    "g"
  );
  for (const m of text.matchAll(isoRange)) {
    if (m[2] < m[1]) continue;
    push(m[1], m[2], `${m[1]} → ${m[2]}`, m.index!);
  }

  // "free in May", "anytime in September 2027", "July 2027" — the whole month.
  //
  // A preposition, or a year, has to mark it. A bare month name on its own is
  // too often a word in a sentence ("we may drive") to read as an answer.
  const wholeMonth = new RegExp(
    String.raw`\b(?:(?:in|during|over|for|anytime in|sometime in)\s+(${MONTH_PATTERN})\b\.?\s*,?\s*(\d{4})?|(${MONTH_PATTERN})\.?\s*,?\s+(\d{4}))\b`,
    "gi"
  );
  for (const m of text.matchAll(wholeMonth)) {
    if (inRange(m.index!)) continue;
    const month = monthOf(m[1] ?? m[3]);
    if (month < 1) continue;
    const year = Number(m[2] ?? m[4]) || yearFor(month, today);
    push(
      iso(year, month, 1),
      iso(year, month, daysIn(year, month)),
      `All of ${titleCase(MONTHS[month - 1])} ${year}`,
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
