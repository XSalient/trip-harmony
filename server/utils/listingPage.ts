/**
 * Turning an accommodation listing URL into facts the extractor LLM can use.
 *
 * Three independent sources, because booking sites routinely refuse a
 * server-side fetch: whatever the page's HTML gives us, whatever the URL itself
 * encodes, and — when both fall short — whatever the member copied out of the
 * page in their own browser. Booking.com answers a plain `fetch` with a robot
 * check no header will talk it out of, but its URL still carries the property
 * slug, the country and the stay dates, and the browser that just rendered the
 * page is not blocked at all.
 *
 * Everything below the fetch is pure so it can be tested without a network.
 */
import { differenceInCalendarDays } from "date-fns";

export type ListingPageFacts = {
  title?: string;
  siteName?: string;
  description?: string;
  imageUrl?: string;
  canonicalUrl?: string;
  /** schema.org blocks the page publishes about itself, pruned to what we use. */
  structuredData?: Record<string, unknown>[];
};

export type ListingUrlHints = {
  host?: string;
  /** Property name guessed from the name-like path segments, `ti-club` → "Ti Club". */
  slug?: string;
  /** ISO 3166-1 alpha-2 code some sites put in the path (Booking: `/hotel/si/…`). */
  countryCode?: string;
  checkIn?: string;
  checkOut?: string;
  nights?: number;
  adults?: number;
  children?: number;
  rooms?: number;
  currency?: string;
};

/**
 * `finalUrl` is where the redirects ended up, and only set when that differs
 * from what was asked for. A share link (`/Share-xTk9pQ`) encodes nothing at
 * all; the page it lands on encodes the property — so the URL we were answered
 * from is worth more than the one that was pasted, blocked or not.
 */
export type FetchedListingPage =
  | { ok: true; html: string; finalUrl?: string }
  | {
      ok: false;
      /** `blocked` means the site answered, but refused us. */
      reason: "blocked" | "not-html" | "unreachable";
      status?: number;
      finalUrl?: string;
    };

/** Fields the client form knows how to fill. */
export type ExtractedAccommodation = {
  name?: string;
  description?: string;
  location?: string;
  imageUrl?: string;
  pricePerNight?: string;
  totalPrice?: string;
  bedrooms?: number;
  bathrooms?: number;
  singleBeds?: number;
  doubleBeds?: number;
  toilets?: number;
  ensuites?: number;
  freeParking?: boolean;
  camperParking?: boolean;
  amenities?: string[];
};

/**
 * A real browser's headers. Sites that gate on `User-Agent` alone let this
 * through; the ones that fingerprint harder are handled by the `blocked` path.
 */
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
};

const MAX_HTML_CHARS = 1_500_000;

/** Hosts that would make this endpoint a probe into the deployment's own network. */
const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

export function isFetchableListingUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return !PRIVATE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

export async function fetchListingPage(
  url: string,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {}
): Promise<FetchedListingPage> {
  if (!isFetchableListingUrl(url)) return { ok: false, reason: "unreachable" };
  let res: Response;
  try {
    res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  // Only worth carrying when the redirects actually moved us.
  const finalUrl = res.url && res.url !== url ? res.url : undefined;
  if (!res.ok) {
    const blocked = [401, 403, 405, 406, 418, 429].includes(res.status);
    return {
      ok: false,
      reason: blocked ? "blocked" : "unreachable",
      status: res.status,
      ...(finalUrl ? { finalUrl } : {}),
    };
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !/html|xml/i.test(contentType))
    return {
      ok: false,
      reason: "not-html",
      status: res.status,
      ...(finalUrl ? { finalUrl } : {}),
    };
  const html = await res.text();
  return {
    ok: true,
    html: html.slice(0, MAX_HTML_CHARS),
    ...(finalUrl ? { finalUrl } : {}),
  };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  euro: "€",
  pound: "£",
  yen: "¥",
  deg: "°",
  middot: "·",
  bull: "•",
  laquo: "«",
  raquo: "»",
  times: "×",
  szlig: "ß",
  aelig: "æ",
  oslash: "ø",
  aring: "å",
};

/**
 * `&ocirc;` is "o" plus a circumflex. Composing the accent beats enumerating
 * the hundreds of named entities — and hotel names are full of them.
 */
const COMBINING_ACCENTS: Record<string, string> = {
  grave: "̀",
  acute: "́",
  circ: "̂",
  tilde: "̃",
  uml: "̈",
  ring: "̊",
  cedil: "̧",
};

function decodeAccentEntity(code: string): string | undefined {
  const match = /^([a-zA-Z])(grave|acute|circ|tilde|uml|ring|cedil)$/.exec(
    code
  );
  if (!match) return undefined;
  return (match[1] + COMBINING_ACCENTS[match[2]]).normalize("NFC");
}

export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (match, code: string) => {
      if (code.startsWith("#")) {
        const hex = code[1] === "x" || code[1] === "X";
        const value = Number.parseInt(
          hex ? code.slice(2) : code.slice(1),
          hex ? 16 : 10
        );
        return Number.isFinite(value) && value > 0 && value <= 0x10ffff
          ? String.fromCodePoint(value)
          : match;
      }
      // Case matters for accents (`&Uuml;` is Ü), not for the rest.
      return (
        decodeAccentEntity(code) ?? NAMED_ENTITIES[code.toLowerCase()] ?? match
      );
    }
  );
}

/** Attribute order varies by site, so parse the tag rather than matching a fixed shape. */
function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag)) !== null) {
    attrs[match[1].toLowerCase()] = decodeHtmlEntities(
      match[2] ?? match[3] ?? match[4] ?? ""
    );
  }
  return attrs;
}

function absoluteUrl(
  value: string | undefined,
  base?: string
): string | undefined {
  if (!value) return undefined;
  try {
    const url = base ? new URL(value, base) : new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** schema.org types that describe somewhere to stay. Vrbo uses `VacationRental`. */
const STRUCTURED_DATA_TYPES =
  /(hotel|lodging|apartment|resort|motel|hostel|house|accommodation|campground|campsite|rental|villa|cabin|cottage|chalet|guest|bed_?and_?breakfast|inn|room|place|product|offer)/i;

function flattenJsonLd(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const child of node) flattenJsonLd(child, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if ("@graph" in obj) flattenJsonLd(obj["@graph"], out);
  const type = obj["@type"];
  const typeText = Array.isArray(type) ? type.join(" ") : String(type ?? "");
  if (STRUCTURED_DATA_TYPES.test(typeText)) out.push(obj);
}

/** Keep the handful of schema.org fields worth spending prompt tokens on. */
function pruneStructuredData(node: Record<string, unknown>) {
  const pick = (key: string) => node[key];
  const address = node.address;
  const addressText =
    typeof address === "string"
      ? address
      : address && typeof address === "object"
        ? [
            (address as Record<string, unknown>).streetAddress,
            (address as Record<string, unknown>).addressLocality,
            (address as Record<string, unknown>).addressRegion,
            (address as Record<string, unknown>).addressCountry,
          ]
            .filter(part => typeof part === "string" && part.trim())
            .join(", ")
        : undefined;
  const amenities = Array.isArray(node.amenityFeature)
    ? node.amenityFeature
        .map(a =>
          typeof a === "string" ? a : (a as Record<string, unknown>)?.name
        )
        .filter((a): a is string => typeof a === "string")
        .slice(0, 20)
    : undefined;
  const pruned: Record<string, unknown> = {
    type: node["@type"],
    name: pick("name"),
    description: pick("description"),
    address: addressText || undefined,
    priceRange: pick("priceRange"),
    numberOfRooms: pick("numberOfRooms"),
    starRating: (pick("starRating") as Record<string, unknown>)?.ratingValue,
    rating: (pick("aggregateRating") as Record<string, unknown>)?.ratingValue,
    offers: pick("offers"),
    amenities,
  };
  for (const [key, value] of Object.entries(pruned)) {
    if (value === undefined || value === null || value === "")
      delete pruned[key];
  }
  return pruned;
}

export function parseListingHtml(
  html: string,
  pageUrl?: string
): ListingPageFacts {
  const metas = new Map<string, string>();
  for (const [tag] of Array.from(html.matchAll(/<meta\b[^>]*>/gi))) {
    const attrs = parseAttributes(tag);
    const key = (
      attrs.property ||
      attrs.name ||
      attrs.itemprop ||
      ""
    ).toLowerCase();
    const content = attrs.content?.trim();
    if (key && content && !metas.has(key)) metas.set(key, content);
  }

  let canonicalUrl: string | undefined;
  for (const [tag] of Array.from(html.matchAll(/<link\b[^>]*>/gi))) {
    const attrs = parseAttributes(tag);
    if (attrs.rel?.toLowerCase() === "canonical" && attrs.href) {
      canonicalUrl = absoluteUrl(attrs.href, pageUrl);
      break;
    }
  }

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const structuredData: Record<string, unknown>[] = [];
  const jsonLdBlocks = Array.from(
    html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  );
  for (const match of jsonLdBlocks) {
    try {
      flattenJsonLd(JSON.parse(match[1].trim()), structuredData);
    } catch {
      // Malformed blocks are common; the meta tags still carry the basics.
    }
  }

  const facts: ListingPageFacts = {
    title:
      metas.get("og:title") ||
      metas.get("twitter:title") ||
      (titleTag ? decodeHtmlEntities(titleTag[1]).trim() : undefined),
    siteName: metas.get("og:site_name"),
    description:
      metas.get("og:description") ||
      metas.get("twitter:description") ||
      metas.get("description"),
    imageUrl: absoluteUrl(
      metas.get("og:image") ||
        metas.get("og:image:secure_url") ||
        metas.get("twitter:image"),
      pageUrl
    ),
    canonicalUrl,
    structuredData: structuredData.length
      ? structuredData.slice(0, 3).map(pruneStructuredData)
      : undefined,
  };
  for (const key of Object.keys(facts) as (keyof ListingPageFacts)[]) {
    if (!facts[key]) delete facts[key];
  }
  return facts;
}

/**
 * A 200 that is really a refusal. Feeding "Are you a robot?" to the extractor
 * is how a listing ends up named after a captcha page.
 */
export function looksLikeBotCheck(facts: ListingPageFacts): boolean {
  if (facts.structuredData?.length) return false;
  const text = `${facts.title ?? ""} ${facts.description ?? ""}`.toLowerCase();
  if (!text.trim()) return true;
  return /robot|captcha|are you a human|access denied|access to this page|unusual traffic|request blocked|just a moment|verify you are|security check|forbidden/.test(
    text
  );
}

const TRACKING_PARAMS = new Set([
  "aid",
  "all_sr_blocks",
  "atlas_src",
  "dist",
  "efdco",
  "fbclid",
  "gclid",
  "highlighted_blocks",
  "label",
  "lang_click",
  "lp_sid",
  "matching_block_id",
  "msclkid",
  "sb_price_type",
  "sid",
  "soz",
  "srepoch",
  "srpvid",
  "ucfs",
]);
const TRACKING_PREFIXES = ["utm_", "req_", "_"];

/** The pasted URL minus the tracking payload — shorter prompts, same page. */
export function cleanListingUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      const name = key.toLowerCase();
      if (
        TRACKING_PARAMS.has(name) ||
        TRACKING_PREFIXES.some(prefix => name.startsWith(prefix))
      )
        url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function firstParam(
  params: URLSearchParams,
  names: string[]
): string | undefined {
  for (const name of names) {
    const value = params.get(name);
    if (value) return value;
  }
  return undefined;
}

/** Path segments that are furniture, not a property: `/en/rooms/` names nothing. */
const GENERIC_SEGMENTS =
  /^(en|en-gb|en-us|de|fr|es|it|nl|www|hotel|hotels|property|properties|apartment|apartments|rooms?|suites?|accommodation|accommodations|lodging|stay|stays|booking|bookings|reserve|reservation|reservations|search|listing|listings|detail|details|index|home|page|hotel-information|rates|availability|share|shared|link)$/i;

function humaniseSlug(segment: string): string | undefined {
  // "ti-club.en-gb.html" → "ti-club": the locale and extension are not a name.
  const base = segment.split(/[?#]/)[0].split(".")[0];
  if (GENERIC_SEGMENTS.test(base)) return undefined;
  const words = base
    .split(/[-_+%]/)
    .filter(Boolean)
    // A token mixing letters and digits is an id, not a word: `Share-xTk9pQ` is
    // a share link, and naming the stay after it is worse than naming nothing.
    .filter(word => !(/\d/.test(word) && /[a-z]/i.test(word)));
  // Opaque ids ("1234567", "1a") say nothing; only word-ish slugs are a name.
  if (!words.length || !/[a-z]{3}/i.test(words.join(""))) return undefined;
  // What survived can be furniture on its own: "share" alone names nothing.
  if (words.every(word => GENERIC_SEGMENTS.test(word))) return undefined;
  return words
    .map(word =>
      /^[a-z]/.test(word) ? word[0].toUpperCase() + word.slice(1) : word
    )
    .join(" ");
}

/**
 * The name is not always in the last segment — Agoda ends on the city
 * (`/the-sukhothai-bangkok/hotel/bangkok-th.html`). Of the segments that could
 * be a name, the wordiest one is the property; ties go to the deepest.
 */
function slugFromSegments(segments: string[]): string | undefined {
  let best: string | undefined;
  let bestWords = 0;
  for (const segment of segments) {
    const slug = humaniseSlug(segment);
    if (!slug) continue;
    const words = slug.split(" ").length;
    if (words >= bestWords) {
      best = slug;
      bestWords = words;
    }
  }
  return best;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function nightsBetween(checkIn: string, checkOut: string): number | undefined {
  const nights = differenceInCalendarDays(
    new Date(checkOut),
    new Date(checkIn)
  );
  return nights > 0 && nights <= 365 ? nights : undefined;
}

export function hintsFromListingUrl(raw: string): ListingUrlHints {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {};
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const hints: ListingUrlHints = { host: url.hostname.replace(/^www\./, "") };

  const slug = slugFromSegments(segments);
  if (slug) hints.slug = slug;

  const propertyIndex = segments.findIndex(s =>
    /^(hotel|hotels|property|properties|apartment|apartments)$/i.test(s)
  );
  const afterProperty = segments[propertyIndex + 1];
  if (propertyIndex >= 0 && afterProperty && /^[a-z]{2}$/i.test(afterProperty))
    hints.countryCode = afterProperty.toLowerCase();

  const params = url.searchParams;
  // Every booking engine spells these differently; Expedia uses `chkin`,
  // independent hotels usually `arrival`.
  const checkIn = firstParam(params, [
    "checkin",
    "checkIn",
    "check_in",
    "checkin_date",
    "q-check-in",
    "chkin",
    "arrival",
    "arrivalDate",
    "arrival_date",
    "startDate",
    "start_date",
    "from",
  ]);
  const checkOut = firstParam(params, [
    "checkout",
    "checkOut",
    "check_out",
    "checkout_date",
    "q-check-out",
    "chkout",
    "departure",
    "departureDate",
    "departure_date",
    "endDate",
    "end_date",
    "to",
  ]);
  if (checkIn && ISO_DATE.test(checkIn)) hints.checkIn = checkIn;
  if (checkOut && ISO_DATE.test(checkOut)) hints.checkOut = checkOut;
  if (hints.checkIn && hints.checkOut) {
    const nights = nightsBetween(hints.checkIn, hints.checkOut);
    if (nights) hints.nights = nights;
  }

  const adults = toCount(
    firstParam(params, [
      "group_adults",
      "adults",
      "numberOfAdults",
      "adultsCount",
    ]),
    32
  );
  const children = toCount(
    firstParam(params, ["group_children", "children", "numberOfChildren"]),
    32
  );
  const rooms = toCount(
    firstParam(params, ["no_rooms", "rooms", "numberOfRooms"]),
    32
  );
  if (adults !== undefined) hints.adults = adults;
  if (children !== undefined) hints.children = children;
  if (rooms !== undefined) hints.rooms = rooms;

  const currency = firstParam(params, ["selected_currency", "currency", "cur"]);
  if (currency && /^[A-Za-z]{3}$/.test(currency))
    hints.currency = currency.toUpperCase();

  return hints;
}

/**
 * The same page has several spellings, and none of them carries everything: a
 * share link redirects to the URL that names the property but drops the search,
 * and a canonical URL never carries the search at all. So take each field from
 * the first candidate that has it, most authoritative first, and let the pasted
 * URL supply the dates and guest counts it alone knows.
 */
export function mergeListingHints(
  ...candidates: (ListingUrlHints | undefined)[]
): ListingUrlHints {
  const merged: Record<string, unknown> = {};
  for (const candidate of candidates) {
    if (!candidate) continue;
    for (const [key, value] of Object.entries(candidate)) {
      if (value !== undefined && merged[key] === undefined) merged[key] = value;
    }
  }
  const hints = merged as ListingUrlHints;
  // The winning dates can come from a different URL than the winning nights did.
  delete hints.nights;
  if (hints.checkIn && hints.checkOut) {
    const nights = nightsBetween(hints.checkIn, hints.checkOut);
    if (nights) hints.nights = nights;
  }
  return hints;
}

/** True when there is something worth asking the model about. */
export function hasUsableSignal(
  facts: ListingPageFacts | null,
  hints: ListingUrlHints
): boolean {
  if (
    facts &&
    (facts.title || facts.description || facts.structuredData?.length)
  )
    return true;
  return Boolean(hints.slug || hints.countryCode);
}

/**
 * Lines that are the site, not the stay. A copied Booking.com page opens with
 * a nav bar and closes with every city they sell; neither says anything about
 * this property, and both crowd out the lines that do.
 */
const PASTE_NOISE =
  /^(skip to (main )?content|sign in|sign up|register|log ?in|my account|your account|list your property|manage your bookings?|customer service|help( cent(re|er))?|we use cookies|cookie (policy|settings|preferences)|accept( all)?( cookies)?|manage settings|privacy( policy| statement)?|terms( (and|&) conditions)?|subscribe|newsletter|save time,? save money|loading\.{0,3}|see availability|show prices|i'?ll reserve|it only takes \d+ minutes?|home|search|menu|close|back|share|save|next|previous|©.*|all rights reserved.*|language|currency|english \(.*\)|copyright.*)$/i;

/**
 * Lines that carry a fact worth extracting. Anything matching survives even
 * deep in the page, because the price for these dates is usually far below the
 * fold, under a wall of rate rows.
 */
const PASTE_SIGNAL =
  /([€$£¥₹]\s?\d|\d\s?(€|£|\$|EUR|USD|GBP|CHF|SEK|NOK|PLN|CZK)\b|\bper night\b|\btotal\b|\b\d+\s?(night|bedroom|bathroom|bed|guest|adult|child|person|people|sq ?m|m²|km|metre|meter|mile)s?\b|\bsleeps\b|\bcheck[- ]?(in|out)\b|\bfree (wifi|parking|cancellation)\b|\b(wifi|parking|breakfast|pool|kitchen|kitchenette|air ?condition|balcony|terrace|garden|sauna|washing machine|dishwasher|bbq|pets?)\b|\b(apartment|studio|villa|chalet|cottage|suite|dormitory|hostel|hotel|guesthouse|bed and breakfast)\b|\b(rated|rating|reviews?|scored?)\b|\b(address|street|road|avenue)\b|\b\d{4,5}\s+[A-Z])/i;

const PASTE_MAX_LINE = 300;
/** The head almost always holds the name, the address and the headline price. */
const PASTE_HEAD_LINES = 60;

/**
 * A copied listing page → something worth putting in a prompt.
 *
 * When a site refuses us, the member's own browser is not refused: they can
 * select the page and copy it. What arrives is ~100k characters of chrome
 * around a few hundred that matter, so keep the head of the page and every
 * line that carries a fact, drop the furniture, and never repeat a line — the
 * same room row appears once per rate plan.
 */
export function condenseListingText(raw: string, maxChars = 12_000): string {
  if (typeof raw !== "string") return "";
  const seen = new Set<string>();
  const head: string[] = [];
  const facts: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    // `\s` covers the non-breaking spaces a copied page is full of.
    const text = decodeHtmlEntities(line).replace(/\s+/g, " ").trim();
    if (text.length < 2 || PASTE_NOISE.test(text)) continue;
    const clipped =
      text.length > PASTE_MAX_LINE
        ? `${text.slice(0, PASTE_MAX_LINE).trim()}…`
        : text;
    const key = clipped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (head.length < PASTE_HEAD_LINES) head.push(clipped);
    else if (PASTE_SIGNAL.test(clipped)) facts.push(clipped);
  }
  const kept: string[] = [];
  let length = 0;
  for (const line of [...head, ...facts]) {
    if (length + line.length + 1 > maxChars) break;
    kept.push(line);
    length += line.length + 1;
  }
  return kept.join("\n");
}

/** Below this a paste is a stray click, not a page worth asking the model about. */
export const MIN_PASTED_CHARS = 40;

/**
 * Money as the schema stores it. Models return "€1,234.50", "1.234,56 EUR" or a
 * bare number depending on the page, and a decimal column takes none of those.
 */
export function toDecimalString(value: unknown): string | undefined {
  let text: string;
  if (typeof value === "number") text = String(value);
  else if (typeof value === "string") text = value;
  else return undefined;

  if (/^\s*-/.test(text)) return undefined; // a negative price is a parse error
  const cleaned = text.replace(/[^\d.,]/g, "");
  if (!cleaned) return undefined;
  // A trailing ",dd" is a decimal comma; anything else makes it a thousands mark.
  const commaIsDecimal = /,\d{1,2}$/.test(cleaned) && !/\.\d+$/.test(cleaned);
  const normalised = commaIsDecimal
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  const parsed = Number.parseFloat(normalised);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1e9) return undefined;
  return String(Math.round(parsed * 100) / 100);
}

export function toCount(value: unknown, max = 64): number | undefined {
  const decimal = toDecimalString(value);
  if (decimal === undefined) return undefined;
  const rounded = Math.round(Number.parseFloat(decimal));
  if (!Number.isFinite(rounded) || rounded < 0 || rounded > max)
    return undefined;
  return rounded;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return undefined;
  if (/^(true|yes|y|1|free|included)$/i.test(value.trim())) return true;
  if (/^(false|no|n|0|none|paid)$/i.test(value.trim())) return false;
  return undefined;
}

function toText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || /^(null|n\/a|unknown)$/i.test(trimmed)) return undefined;
  return trimmed.length > maxLength
    ? trimmed.slice(0, maxLength).trim()
    : trimmed;
}

function toAmenities(value: unknown): string[] | undefined {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const seen = new Set<string>();
  const amenities: string[] = [];
  for (const entry of raw) {
    const text = toText(entry, 40);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    amenities.push(text);
    if (amenities.length === 20) break;
  }
  return amenities.length ? amenities : undefined;
}

/**
 * Model output → values the form and the schema accept. Column limits are
 * enforced here (`name` is varchar(255)) so a chatty extraction cannot make the
 * insert fail.
 */
export function coerceExtractedAccommodation(
  raw: unknown,
  pageUrl?: string
): ExtractedAccommodation {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const extracted: ExtractedAccommodation = {
    name: toText(input.name, 255),
    description: toText(input.description, 1000),
    location: toText(input.location, 500),
    imageUrl: absoluteUrl(toText(input.imageUrl, 2000), pageUrl),
    pricePerNight: toDecimalString(input.pricePerNight),
    totalPrice: toDecimalString(input.totalPrice),
    bedrooms: toCount(input.bedrooms),
    bathrooms: toCount(input.bathrooms),
    singleBeds: toCount(input.singleBeds),
    doubleBeds: toCount(input.doubleBeds),
    toilets: toCount(input.toilets),
    ensuites: toCount(input.ensuites),
    freeParking: toBoolean(input.freeParking),
    camperParking: toBoolean(input.camperParking),
    amenities: toAmenities(input.amenities),
  };
  for (const key of Object.keys(
    extracted
  ) as (keyof ExtractedAccommodation)[]) {
    if (extracted[key] === undefined) delete extracted[key];
  }
  return extracted;
}
