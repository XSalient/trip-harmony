/**
 * The one call the import path makes when a listing site refuses us.
 *
 * Off by default. When `SCRAPER_PROVIDER` and `SCRAPER_API_KEY` are set, this
 * hands the URL to that service and returns whatever page comes back; when they
 * are not, it says `not-configured` and the import degrades exactly as it did
 * before this existed. It never throws — a fallback on a path that has already
 * failed once must not be the thing that turns a half-filled form into an error.
 *
 * See docs/adr/0013-optional-scraper-fallback-for-blocked-listings.md.
 */
import { config } from "../../_core/env.js";
import { logger } from "../../_core/logger.js";
import { isFetchableListingUrl, MAX_HTML_CHARS } from "../listingPage.js";
import {
  buildScrapeRequest,
  readScrapedPage,
  resolveScraperProvider,
  type ScraperProvider,
} from "./providers.js";

const log = logger.child({ scope: "scraper" });

export type ScrapedPage =
  | { ok: true; html: string; provider: string; finalUrl?: string }
  | {
      ok: false;
      reason: /** No provider configured — the ladder simply skips this rung. */
      | "not-configured"
        /** A provider is configured but its settings cannot be honoured. */
        | "misconfigured"
        /** The operator limited the quota to other hosts. */
        | "host-not-allowed"
        /** The service reached the site and the site refused it too. */
        | "blocked"
        /** The service itself failed us: bad key, no credit, an outage. */
        | "provider-error"
        | "unreachable";
      provider?: string;
      status?: number;
    };

/** Statuses that mean "answered, but refused" — the same list as a direct fetch. */
const REFUSAL_STATUSES = new Set([401, 403, 405, 406, 418, 429]);

function currentProvider(): ScraperProvider | null {
  return resolveScraperProvider({
    provider: config.scraper.provider,
    apiKey: config.scraper.apiKey,
    endpoint: config.scraper.endpoint,
    method: config.scraper.method,
    urlParam: config.scraper.urlParam,
    apiKeyParam: config.scraper.apiKeyParam,
    apiKeyIn: config.scraper.apiKeyIn,
    params: config.scraper.params,
    htmlPath: config.scraper.htmlPath,
  });
}

/** True when a scrape is worth attempting. Cheap: the ladder asks on every import. */
export function isScraperConfigured(): boolean {
  return Boolean(
    config.scraper.provider.trim() && config.scraper.apiKey.trim()
  );
}

/** Safe to log and to show in `/api/health`: names the service, never the key. */
export function describeScraper(): {
  enabled: boolean;
  provider: string;
  renderJs?: boolean;
  hosts?: string[];
  error?: string;
} {
  if (!isScraperConfigured()) return { enabled: false, provider: "none" };
  try {
    const provider = currentProvider();
    if (!provider) return { enabled: false, provider: "none" };
    return {
      enabled: true,
      provider: provider.name,
      renderJs: config.scraper.renderJs,
      ...(config.scraper.hosts.length ? { hosts: config.scraper.hosts } : {}),
    };
  } catch (err) {
    return {
      enabled: false,
      provider: config.scraper.provider,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * `booking.com` covers `www.booking.com`, and does not cover `notbooking.com`.
 * An empty list means every host, which is the default: a per-site list is the
 * maintenance burden ADR-0008 was written to avoid.
 */
function hostAllowed(url: string, hosts: string[]): boolean {
  if (!hosts.length) return true;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hosts.some(
    allowed => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );
}

export async function scrapeListingPage(url: string): Promise<ScrapedPage> {
  if (!isScraperConfigured()) return { ok: false, reason: "not-configured" };
  // The same guard the direct fetch has: a paid proxy is no reason to let this
  // endpoint probe the deployment's own network.
  if (!isFetchableListingUrl(url)) return { ok: false, reason: "unreachable" };

  let provider: ScraperProvider | null;
  try {
    provider = currentProvider();
  } catch (err) {
    log.error("scraper is configured but its settings cannot be used", { err });
    return { ok: false, reason: "misconfigured" };
  }
  if (!provider) return { ok: false, reason: "not-configured" };

  if (!hostAllowed(url, config.scraper.hosts))
    return { ok: false, reason: "host-not-allowed", provider: provider.name };

  const request = buildScrapeRequest(provider, url, {
    renderJs: config.scraper.renderJs,
  });

  let res: Response;
  const started = Date.now();
  try {
    res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body ? { body: request.body } : {}),
      signal: AbortSignal.timeout(config.scraper.timeoutMs),
    });
  } catch (err) {
    log.warn("scraper service unreachable", { provider: provider.name, err });
    return { ok: false, reason: "unreachable", provider: provider.name };
  }

  const body = await res.text();
  if (!res.ok) {
    // The service's own status. A 401 here is our key, not the listing site.
    log.warn("scraper service refused the request", {
      provider: provider.name,
      status: res.status,
      // Enough of the body to tell "out of credit" from "bad key", no more.
      detail: body.slice(0, 200),
    });
    return {
      ok: false,
      reason: "provider-error",
      provider: provider.name,
      status: res.status,
    };
  }

  const payload = readScrapedPage(
    provider,
    res.headers.get("content-type") ?? "",
    body
  );

  if (!payload.html) {
    const blocked =
      payload.targetStatus !== undefined &&
      REFUSAL_STATUSES.has(payload.targetStatus);
    log.info("scraper returned no page", {
      provider: provider.name,
      targetStatus: payload.targetStatus,
      error: payload.error,
    });
    return {
      ok: false,
      reason: blocked ? "blocked" : "provider-error",
      provider: provider.name,
      ...(payload.targetStatus !== undefined
        ? { status: payload.targetStatus }
        : {}),
    };
  }

  log.info("scraper returned a page", {
    provider: provider.name,
    chars: payload.html.length,
    ms: Date.now() - started,
  });
  return {
    ok: true,
    html: payload.html.slice(0, MAX_HTML_CHARS),
    provider: provider.name,
    ...(payload.finalUrl ? { finalUrl: payload.finalUrl } : {}),
  };
}
