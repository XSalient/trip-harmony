/**
 * Describing an unblocking service as data, so switching vendor is an env edit.
 *
 * Every service in this market is the same HTTP call wearing different names:
 * an endpoint, an API key somewhere, the target URL in a parameter, a flag for
 * "run the page's JavaScript", and either the page itself or the page inside a
 * JSON envelope. Presets below fill those five blanks for the services people
 * ask for; each blank is also an environment variable, so a service nobody
 * thought of is `SCRAPER_PROVIDER=custom` plus the fields it needs — no code
 * change, no deploy of ours.
 *
 * Everything here is pure. Nothing in this file makes a request.
 */

export type ScraperAuthPlacement = "query" | "header" | "body";

/** The five blanks, filled. */
type ScraperPreset = {
  endpoint: string;
  method: "GET" | "POST";
  auth: { placement: ScraperAuthPlacement; param: string };
  urlParam: string;
  /** The parameter that asks for a rendered page; absent when there is none. */
  renderParam?: string;
  params?: Record<string, unknown>;
  /** Dotted path to the HTML in a JSON reply. Empty means the body is the page. */
  htmlPath?: string;
  /** Dotted paths into a JSON reply, for services that report these. */
  statusPath?: string;
  errorPath?: string;
  finalUrlPath?: string;
};

/**
 * Endpoints and parameter names as each service documents them. They are a
 * starting point, not a contract we control: if an account is on a different
 * plan or the vendor renames something, override the field rather than waiting
 * for a patch — see `resolveScraperProvider`.
 */
const PRESETS: Record<string, ScraperPreset> = {
  /**
   * The GET form, which is the one confirmed against a real key:
   *   curl "https://api.scrapeowl.com/v1/scrape?api_key=…&url=…"
   * ScrapeOwl also accepts a JSON POST body; if you prefer it, that is
   * `SCRAPER_METHOD=POST` and `SCRAPER_API_KEY_IN=body` and no code change.
   */
  scrapingowl: {
    endpoint: "https://api.scrapeowl.com/v1/scrape",
    method: "GET",
    auth: { placement: "query", param: "api_key" },
    urlParam: "url",
    renderParam: "render_js",
    htmlPath: "html",
    statusPath: "status",
    errorPath: "error",
  },
  scrapingbee: {
    endpoint: "https://app.scrapingbee.com/api/v1",
    method: "GET",
    auth: { placement: "query", param: "api_key" },
    urlParam: "url",
    renderParam: "render_js",
  },
  scraperapi: {
    endpoint: "https://api.scraperapi.com/",
    method: "GET",
    auth: { placement: "query", param: "api_key" },
    urlParam: "url",
    renderParam: "render",
  },
  zenrows: {
    endpoint: "https://api.zenrows.com/v1/",
    method: "GET",
    auth: { placement: "query", param: "apikey" },
    urlParam: "url",
    renderParam: "js_render",
  },
  scrapfly: {
    endpoint: "https://api.scrapfly.io/scrape",
    method: "GET",
    auth: { placement: "query", param: "key" },
    urlParam: "url",
    renderParam: "render_js",
    htmlPath: "result.content",
    finalUrlPath: "result.url",
  },
  /** Nothing assumed: every field comes from the environment. */
  custom: {
    endpoint: "",
    method: "GET",
    auth: { placement: "query", param: "api_key" },
    urlParam: "url",
  },
};

/** The same service, spelled the way whoever set the variable spells it. */
const ALIASES: Record<string, string> = {
  scrapeowl: "scrapingowl",
};

const canonicalise = (name: string) =>
  name.toLowerCase().replace(/[^a-z]/g, "");

export function listScraperPresets(): string[] {
  return Object.keys(PRESETS);
}

/** Exactly the environment this reads, so the caller can be a test. */
export type ScraperSettings = {
  provider: string;
  apiKey: string;
  endpoint?: string;
  method?: string;
  urlParam?: string;
  apiKeyParam?: string;
  apiKeyIn?: string;
  /** `a=b&c=d`, or a JSON object when a value needs characters a query mangles. */
  params?: string;
  htmlPath?: string;
};

export type ScraperProvider = {
  name: string;
  endpoint: string;
  method: "GET" | "POST";
  auth: { placement: ScraperAuthPlacement; param: string };
  apiKey: string;
  urlParam: string;
  renderParam?: string;
  params: Record<string, unknown>;
  htmlPath: string;
  statusPath: string;
  errorPath: string;
  finalUrlPath: string;
};

function parseParams(raw: string | undefined): Record<string, unknown> {
  const text = raw?.trim();
  if (!text) return {};
  if (text.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        return parsed as Record<string, unknown>;
    } catch {
      throw new Error(
        "SCRAPER_PARAMS looks like JSON but does not parse; use `a=b&c=d` or a valid JSON object"
      );
    }
    throw new Error("SCRAPER_PARAMS must be a JSON object, not an array");
  }
  const params: Record<string, unknown> = {};
  new URLSearchParams(text).forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/**
 * The configured provider, or null when the fallback is simply switched off.
 * Throws only for a configuration that cannot be honoured — a name with no
 * preset, or a custom service with nowhere to send the request. Better to fail
 * loudly at the first import than to post an API key at a guessed endpoint.
 */
export function resolveScraperProvider(
  settings: ScraperSettings
): ScraperProvider | null {
  const requested = settings.provider?.trim();
  if (!requested || canonicalise(requested) === "none") return null;
  if (!settings.apiKey?.trim()) return null;

  const key = canonicalise(requested);
  const name = ALIASES[key] ?? key;
  const preset = PRESETS[name];
  if (!preset)
    throw new Error(
      `SCRAPER_PROVIDER="${requested}" is not a known service. Use one of ${listScraperPresets().join(", ")} — "custom" plus SCRAPER_ENDPOINT describes any other.`
    );

  const endpoint = settings.endpoint?.trim() || preset.endpoint;
  if (!endpoint)
    throw new Error(
      `SCRAPER_PROVIDER="${requested}" has no built-in endpoint; set SCRAPER_ENDPOINT.`
    );

  const method = (settings.method?.trim().toUpperCase() || preset.method) as
    | "GET"
    | "POST";
  if (method !== "GET" && method !== "POST")
    throw new Error("SCRAPER_METHOD must be GET or POST");

  const placement = (settings.apiKeyIn?.trim().toLowerCase() ||
    preset.auth.placement) as ScraperAuthPlacement;
  if (!["query", "header", "body"].includes(placement))
    throw new Error("SCRAPER_API_KEY_IN must be query, header or body");

  return {
    name,
    endpoint,
    method,
    auth: {
      placement,
      param: settings.apiKeyParam?.trim() || preset.auth.param,
    },
    apiKey: settings.apiKey.trim(),
    urlParam: settings.urlParam?.trim() || preset.urlParam,
    renderParam: preset.renderParam,
    params: { ...(preset.params ?? {}), ...parseParams(settings.params) },
    // `none` is how an operator says "the body is already the page" on a
    // preset that expects an envelope; an unset variable keeps the preset's.
    htmlPath: /^(none|-)$/i.test(settings.htmlPath?.trim() ?? "")
      ? ""
      : settings.htmlPath?.trim() || preset.htmlPath || "",
    statusPath: preset.statusPath ?? "",
    errorPath: preset.errorPath ?? "",
    finalUrlPath: preset.finalUrlPath ?? "",
  };
}

export type ScrapeRequest = {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
};

/** `"true"` from a query string is a boolean once it reaches a JSON body. */
function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function buildScrapeRequest(
  provider: ScraperProvider,
  targetUrl: string,
  { renderJs }: { renderJs: boolean }
): ScrapeRequest {
  const fields: Record<string, unknown> = { ...provider.params };
  fields[provider.urlParam] = targetUrl;
  if (provider.renderParam) fields[provider.renderParam] = renderJs;

  const headers: Record<string, string> = {};
  if (provider.auth.placement === "header")
    headers[provider.auth.param] = provider.apiKey;
  else fields[provider.auth.param] = provider.apiKey;

  if (provider.method === "POST" && provider.auth.placement !== "query") {
    headers["Content-Type"] = "application/json";
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields))
      body[key] = jsonValue(value);
    return {
      url: provider.endpoint,
      method: "POST",
      headers,
      body: JSON.stringify(body),
    };
  }

  const url = new URL(provider.endpoint);
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return { url: url.toString(), method: provider.method, headers };
}

function atPath(node: unknown, path: string): unknown {
  let current = node;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * A body that opens with a doctype or an `html`/`head` tag and has some bulk to
 * it is a listing page. The length matters: a gateway's `<h1>502</h1>` is also
 * HTML, and accepting it would name somebody's stay "502 Bad Gateway".
 */
const MIN_BARE_HTML_CHARS = 500;

function looksLikeHtml(body: string): boolean {
  if (body.length < MIN_BARE_HTML_CHARS) return false;
  return /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>])/i.test(body);
}

export type ScrapedPayload = {
  html?: string;
  finalUrl?: string;
  /** What the service said went wrong, when it answered 200 with a failure. */
  error?: string;
  /** The status the service reports for the *target*, not for itself. */
  targetStatus?: number;
};

/**
 * The service's answer → the page, or the reason there isn't one. A service
 * that reports a target's 403 inside a 200 must not have that JSON handed on
 * as if it were the listing; that is how a stay ends up named `{"error":…}`.
 */
export function readScrapedPage(
  provider: ScraperProvider,
  contentType: string,
  body: string
): ScrapedPayload {
  if (!provider.htmlPath) return { html: body };

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Several services answer with an envelope on one endpoint and the bare
    // page on another, or switch when a plan changes. A body that is plainly a
    // web page is the page, whatever the preset expected — better than telling
    // the traveller we were blocked while holding the listing in our hand.
    if (looksLikeHtml(body)) return { html: body };
    return {
      error: `expected JSON from ${provider.name} but got ${contentType || "an unlabelled body"}`,
    };
  }

  const html = atPath(parsed, provider.htmlPath);
  const targetStatusRaw = provider.statusPath
    ? atPath(parsed, provider.statusPath)
    : undefined;
  const targetStatus =
    typeof targetStatusRaw === "number" ? targetStatusRaw : undefined;
  const errorRaw = provider.errorPath
    ? atPath(parsed, provider.errorPath)
    : undefined;
  const finalUrlRaw = provider.finalUrlPath
    ? atPath(parsed, provider.finalUrlPath)
    : undefined;

  if (typeof html !== "string" || !html.trim()) {
    const error =
      typeof errorRaw === "string" && errorRaw.trim()
        ? errorRaw.trim()
        : `${provider.name} returned no page at "${provider.htmlPath}"`;
    return { error, ...(targetStatus !== undefined ? { targetStatus } : {}) };
  }

  return {
    html,
    ...(typeof finalUrlRaw === "string" ? { finalUrl: finalUrlRaw } : {}),
    ...(targetStatus !== undefined ? { targetStatus } : {}),
  };
}
