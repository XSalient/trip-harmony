/**
 * Naming a property when the listing site refuses us.
 *
 * A blocked page leaves only what the URL encoded — usually a slug and a country
 * code. Google Places turns that into a real name and postal address, which is a
 * lookup rather than a scrape: nothing is fetched from the site that just said
 * no, and the credentials stay server-side. Prices are never taken from here;
 * Places knows what a hotel is called, not what this stay costs.
 *
 * Everything except `lookupPlace` is pure so the matching can be tested without
 * a network.
 */
import { makeRequest } from "../_core/map.js";
import { logger } from "../_core/logger.js";

const log = logger.child({ scope: "placeLookup" });

export type PlaceFacts = {
  name: string;
  address?: string;
  rating?: number;
  ratingCount?: number;
};

type PlaceResult = {
  name?: string;
  formatted_address?: string;
  rating?: number;
  user_ratings_total?: number;
  business_status?: string;
  types?: string[];
};

/** ISO 3166-1 alpha-2 → English country name. The query needs a place, not a code. */
export function countryFromCode(code: string): string | undefined {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return undefined;
  try {
    const name = new Intl.DisplayNames(["en"], {
      type: "region",
      fallback: "none",
    }).of(upper);
    // "ZZ" is a real code meaning "Unknown Region" — a query, but not a place.
    return name && name !== upper && !/unknown/i.test(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

/** The text search query, or undefined when the URL gave us nothing to search for. */
export function placeQuery(hints: {
  slug?: string;
  countryCode?: string;
}): string | undefined {
  if (!hints.slug) return undefined;
  const country = hints.countryCode
    ? countryFromCode(hints.countryCode)
    : undefined;
  return country ? `${hints.slug}, ${country}` : hints.slug;
}

/** Types that mean "somewhere to stay" rather than a shop that shares the name. */
const LODGING_TYPES = new Set([
  "lodging",
  "campground",
  "rv_park",
  "real_estate_agency",
  "resort_hotel",
  "motel",
  "hotel",
  "guest_house",
  "bed_and_breakfast",
]);

/**
 * Places ranks by prominence, so the top hit for a hotel name is sometimes the
 * restaurant inside it. Prefer the first result that is somewhere to stay, and
 * fall back to the first result for the rentals Google files under nothing.
 */
export function pickPlace(results: PlaceResult[]): PlaceFacts | null {
  const open = results.filter(r => r.business_status !== "CLOSED_PERMANENTLY");
  const best =
    open.find(r => r.types?.some(type => LODGING_TYPES.has(type))) ?? open[0];
  if (!best?.name) return null;
  const facts: PlaceFacts = { name: best.name };
  if (best.formatted_address) facts.address = best.formatted_address;
  if (typeof best.rating === "number") facts.rating = best.rating;
  if (typeof best.user_ratings_total === "number")
    facts.ratingCount = best.user_ratings_total;
  return facts;
}

/**
 * Never throws: this is a fallback on a path that has already failed once, and
 * a missing Maps key must not turn a half-filled form into an error.
 */
export async function lookupPlace(query: string): Promise<PlaceFacts | null> {
  try {
    const response = await makeRequest<{
      results?: PlaceResult[];
      status?: string;
    }>("/maps/api/place/textsearch/json", { query });
    if (!response.results?.length) {
      log.info("no place matched the listing URL", {
        query,
        status: response.status,
      });
      return null;
    }
    return pickPlace(response.results);
  } catch (err) {
    log.warn("place lookup failed", { err });
    return null;
  }
}
