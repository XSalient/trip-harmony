/**
 * Getting a listing page, by whatever means are available.
 *
 * ADR-0008 set out a ladder of sources for when a booking site refuses a
 * server-side fetch; ADR-0013 adds one optional rung to it. This module is that
 * ladder, in one place and testable without a network — the router above it
 * only turns the result into a prompt.
 *
 *   1. paste   — the page as the traveller copied it. Outranks everything, and
 *                costs nothing. When present, nothing else is even attempted.
 *   2. page    — a plain fetch. Most sites answer it.
 *   3. scraper — an unblocking service, only when one is configured and only
 *                after the site has refused us. Off by default.
 *   4. place   — Google Places, from the property slug the URL encodes.
 *   5. url     — the slug and country code alone.
 *
 * Each rung runs only because the one above it came back empty, so an import
 * that works costs one request and nothing else.
 */
import { logger } from "../_core/logger.js";
import {
  condenseListingText,
  fetchListingPage,
  hasUsableSignal,
  hintsFromListingUrl,
  looksLikeBotCheck,
  mergeListingHints,
  MIN_PASTED_CHARS,
  parseListingHtml,
  resolveListingRedirects,
  type ListingPageFacts,
  type ListingUrlHints,
} from "./listingPage.js";
import { lookupPlace, placeQuery, type PlaceFacts } from "./placeLookup.js";
import { isScraperConfigured, scrapeListingPage } from "./scraper/index.js";

const log = logger.child({ scope: "listingSource" });

/** Which rung answered. Part of the endpoint's contract; the UI says it out loud. */
export type ListingSourceName =
  | "paste"
  | "page"
  | "scraper"
  | "place"
  | "url"
  | "none";

export type ResolvedListingSource = {
  /** The URL the facts belong to: after redirects, and after the scrape. */
  resolvedUrl: string;
  facts: ListingPageFacts | null;
  /** Condensed paste, or "" when the member did not give us one. */
  pastedText: string;
  hints: ListingUrlHints;
  place: PlaceFacts | null;
  /** The site refused us and the paste box is worth offering. */
  blocked: boolean;
  /** False when there is nothing at all to ask the model about. */
  usable: boolean;
  source: ListingSourceName;
};

export async function resolveListingSource({
  url,
  pageText,
}: {
  url: string;
  pageText?: string;
}): Promise<ResolvedListingSource> {
  const pastedText = pageText ? condenseListingText(pageText) : "";
  if (pastedText.length >= MIN_PASTED_CHARS) {
    // Nothing to gain from asking a site that already refused us, and the paste
    // knows more than the page we would have got anyway.
    return {
      resolvedUrl: url,
      facts: null,
      pastedText,
      hints: mergeListingHints(hintsFromListingUrl(url)),
      place: null,
      blocked: false,
      usable: true,
      source: "paste",
    };
  }

  let facts: ListingPageFacts | null = null;
  let resolvedUrl = url;
  let blocked = false;
  let source: ListingSourceName = "none";

  const page = await fetchListingPage(url);
  if (page.finalUrl) resolvedUrl = page.finalUrl;
  if (page.ok) {
    const parsed = parseListingHtml(page.html, resolvedUrl);
    // Booking sites answer a server-side fetch with a robot check often enough
    // that a 200 is not evidence the details are there.
    if (looksLikeBotCheck(parsed)) blocked = true;
    else {
      facts = parsed;
      source = "page";
    }
  } else {
    blocked = page.reason === "blocked";
  }

  // A share link tells us nothing until we know where it points, and a refused
  // body does not mean a refused redirect.
  if (!facts && resolvedUrl === url) {
    const redirected = await resolveListingRedirects(url);
    if (redirected) resolvedUrl = redirected;
  }

  if (!facts && isScraperConfigured()) {
    const scraped = await scrapeListingPage(resolvedUrl);
    if (scraped.ok) {
      if (scraped.finalUrl) resolvedUrl = scraped.finalUrl;
      const parsed = parseListingHtml(scraped.html, resolvedUrl);
      if (looksLikeBotCheck(parsed)) {
        log.info("scraper got through but the page is still a robot check", {
          provider: scraped.provider,
        });
      } else {
        facts = parsed;
        source = "scraper";
        // The page was read after all, so there is nothing to paste around.
        blocked = false;
      }
    }
  }

  const hints = mergeListingHints(
    facts?.canonicalUrl ? hintsFromListingUrl(facts.canonicalUrl) : undefined,
    resolvedUrl !== url ? hintsFromListingUrl(resolvedUrl) : undefined,
    hintsFromListingUrl(url)
  );

  const usable = hasUsableSignal(facts, hints);
  if (!facts) {
    log.info("listing page unreadable, falling back to the URL", {
      host: hints.host,
      blocked,
      redirected: resolvedUrl !== url,
      status: page.ok ? 200 : page.status,
      usable,
    });
  }

  // With no page, no paste and no readable URL there is nothing to extract, and
  // a Places lookup with nothing to search for only spends quota.
  if (!usable)
    return {
      resolvedUrl,
      facts: null,
      pastedText: "",
      hints,
      place: null,
      blocked,
      usable: false,
      source: "none",
    };

  // Only when the page never arrived: a page already knows more than a map does.
  const query = facts ? undefined : placeQuery(hints);
  const place = query ? await lookupPlace(query) : null;

  return {
    resolvedUrl,
    facts,
    pastedText: "",
    hints,
    place,
    blocked,
    usable: true,
    source: facts ? source : place ? "place" : "url",
  };
}
