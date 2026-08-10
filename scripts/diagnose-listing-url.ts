/**
 * Why did this listing URL not fill the form?
 *
 * Runs the real import pipeline against one or more URLs and prints what each
 * step returned, so a failure can be attributed to a step rather than guessed
 * at. Every step here is the same code the endpoint runs — nothing is
 * reimplemented for the report.
 *
 *   pnpm diagnose:url "https://www.booking.com/Share-xTk9pQ" …
 *   pnpm diagnose:url --offline <url>   # skip the network, trace URL logic only
 *
 * TypeScript rather than the `.mjs` the rest of `scripts/` uses: this one is a
 * development tool that imports the server's modules, and never runs in a
 * build. Run it through tsx (the `diagnose:url` script does).
 */
import {
  fetchListingPage,
  hasUsableSignal,
  hintsFromListingUrl,
  looksLikeBotCheck,
  mergeListingHints,
  parseListingHtml,
  resolveListingRedirects,
  type ListingPageFacts,
} from "../server/utils/listingPage.js";
import { placeQuery } from "../server/utils/placeLookup.js";
import {
  describeScraper,
  scrapeListingPage,
} from "../server/utils/scraper/index.js";
import {
  buildScrapeRequest,
  readScrapedPage,
  resolveScraperProvider,
} from "../server/utils/scraper/providers.js";
import { config } from "../server/_core/env.js";

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

let stepNumber = 0;
function step(label: string, verdict: string, colour = RESET) {
  const name = label.padEnd(22);
  console.log(
    `  ${DIM}${++stepNumber}.${RESET} ${name} ${colour}${verdict}${RESET}`
  );
}

function detail(text: string) {
  for (const line of text.split("\n"))
    console.log(`     ${DIM}${line}${RESET}`);
}

function summarise(facts: ListingPageFacts): string {
  const parts = [
    facts.title ? `title=${JSON.stringify(facts.title.slice(0, 70))}` : null,
    facts.description ? `description=${facts.description.length} chars` : null,
    facts.imageUrl ? "image=yes" : null,
    facts.structuredData?.length
      ? `ld+json=${facts.structuredData.length} block(s)`
      : null,
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : "(nothing)";
}

async function diagnose(url: string, offline: boolean) {
  stepNumber = 0;
  console.log(`\n${BOLD}── ${url}${RESET}`);

  let facts: ListingPageFacts | null = null;
  let resolvedUrl = url;
  let blocked = false;

  if (offline) {
    step("direct fetch", "skipped (--offline)", DIM);
  } else {
    const started = Date.now();
    const page = await fetchListingPage(url);
    const ms = Date.now() - started;
    if (page.ok) {
      step("direct fetch", `200, ${page.html.length} chars (${ms} ms)`, GREEN);
      const parsed = parseListingHtml(page.html, page.finalUrl ?? url);
      if (looksLikeBotCheck(parsed)) {
        blocked = true;
        step("page metadata", "a bot check, not the listing", RED);
        detail(summarise(parsed));
      } else {
        facts = parsed;
        step("page metadata", "readable", GREEN);
        detail(summarise(parsed));
      }
    } else {
      blocked = page.reason === "blocked";
      step(
        "direct fetch",
        `${page.reason}${page.status ? ` (HTTP ${page.status})` : ""} (${ms} ms)`,
        RED
      );
      step("page metadata", "none — never saw a page", RED);
    }
    if (page.finalUrl) {
      resolvedUrl = page.finalUrl;
      detail(`redirected to ${page.finalUrl}`);
    }
  }

  // A share link says nothing; the page it redirects to says everything. Worth
  // asking for even when the body was refused — a 3xx usually is not.
  if (!offline && resolvedUrl === url) {
    const redirected = await resolveListingRedirects(url);
    step(
      "redirect resolve",
      redirected && redirected !== url ? redirected : "no redirect observed",
      redirected && redirected !== url ? GREEN : DIM
    );
    if (redirected) resolvedUrl = redirected;
  } else {
    step(
      "redirect resolve",
      offline ? "skipped (--offline)" : "already resolved",
      DIM
    );
  }

  if (offline || facts) {
    step("scraper fallback", facts ? "not needed" : "skipped (--offline)", DIM);
  } else if (!describeScraper().enabled) {
    step(
      "scraper fallback",
      `not configured (${describeScraper().provider})`,
      YELLOW
    );
  } else {
    const started = Date.now();
    const scraped = await scrapeListingPage(resolvedUrl);
    const ms = Date.now() - started;
    if (scraped.ok) {
      step(
        "scraper fallback",
        `${describeScraper().provider}: ${scraped.html.length} chars (${ms} ms)`,
        GREEN
      );
      if (scraped.finalUrl) resolvedUrl = scraped.finalUrl;
      const parsed = parseListingHtml(scraped.html, resolvedUrl);
      if (looksLikeBotCheck(parsed)) {
        step("scraped metadata", "still a bot check", RED);
      } else {
        facts = parsed;
        blocked = false;
        step("scraped metadata", "readable", GREEN);
        detail(summarise(parsed));
      }
    } else {
      step(
        "scraper fallback",
        `${describeScraper().provider}: ${scraped.reason}`,
        RED
      );
    }
  }

  const hints = mergeListingHints(
    facts?.canonicalUrl ? hintsFromListingUrl(facts.canonicalUrl) : undefined,
    resolvedUrl !== url ? hintsFromListingUrl(resolvedUrl) : undefined,
    hintsFromListingUrl(url)
  );
  step("url hints", JSON.stringify(hints), hints.slug ? GREEN : YELLOW);

  const usable = hasUsableSignal(facts, hints);
  step("usable signal", usable ? "yes" : "no", usable ? GREEN : RED);

  const query = facts ? undefined : placeQuery(hints);
  step(
    "place lookup query",
    query ?? "(none — nothing to search for)",
    query ? GREEN : DIM
  );

  const verdict = facts
    ? "page read — the model gets real metadata"
    : usable
      ? `no page: the model gets only ${query ? `a map lookup of "${query}"` : "the URL hints"}`
      : "nothing at all — the endpoint returns success:false, source:none";
  console.log(
    `  ${BOLD}→ verdict:${RESET} ${facts ? GREEN : usable ? YELLOW : RED}${verdict}${RESET}` +
      (blocked ? ` ${DIM}(blocked: the paste box is offered)${RESET}` : "")
  );
}

/**
 * Is the scraper wired up at all? Answers the question the listing diagnosis
 * cannot: whether the key, the endpoint and the parameter names are right,
 * separately from whether any given site lets the service in.
 *
 * Deliberately the vendor's own smoke-test target, so this is the same request
 * as the `curl` in their docs, made the way the app makes it.
 */
async function checkScraper(target: string) {
  console.log(`${BOLD}Scraper check${RESET} ${DIM}→ ${target}${RESET}`);
  const summary = describeScraper();
  console.log(`${DIM}config: ${JSON.stringify(summary)}${RESET}`);
  if (!summary.enabled) {
    console.log(
      `  ${RED}Not enabled.${RESET} Set SCRAPER_API_KEY (and SCRAPER_PROVIDER if it is not ${DIM}scrapingowl${RESET}).` +
        (summary.error ? `\n  ${RED}${summary.error}${RESET}` : "")
    );
    return;
  }

  const provider = resolveScraperProvider({
    provider: config.scraper.provider,
    apiKey: config.scraper.apiKey,
    endpoint: config.scraper.endpoint,
    method: config.scraper.method,
    urlParam: config.scraper.urlParam,
    apiKeyParam: config.scraper.apiKeyParam,
    apiKeyIn: config.scraper.apiKeyIn,
    params: config.scraper.params,
    htmlPath: config.scraper.htmlPath,
  })!;
  const request = buildScrapeRequest(provider, target, {
    renderJs: config.scraper.renderJs,
  });
  // The key is in the request; it must not be in the terminal or a scrollback.
  const redact = (text: string) =>
    text.split(provider.apiKey).join("<SCRAPER_API_KEY>");
  step("request", `${request.method} ${redact(request.url)}`);
  if (request.body) detail(redact(request.body));

  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body ? { body: request.body } : {}),
      signal: AbortSignal.timeout(config.scraper.timeoutMs),
    });
  } catch (err) {
    step("response", `could not reach the service: ${String(err)}`, RED);
    return;
  }
  const body = await res.text();
  step(
    "response",
    `HTTP ${res.status} ${res.headers.get("content-type") ?? ""} · ${body.length} chars · ${Date.now() - started} ms`,
    res.ok ? GREEN : RED
  );
  detail(redact(body.slice(0, 400)));

  const payload = readScrapedPage(
    provider,
    res.headers.get("content-type") ?? "",
    body
  );
  step(
    "page extracted",
    payload.html
      ? `yes, ${payload.html.length} chars`
      : `no — ${payload.error ?? "unknown"}`,
    payload.html ? GREEN : RED
  );
  if (payload.html || !res.ok) return;
  if (payload.targetStatus !== undefined && payload.targetStatus >= 400) {
    // Wiring is fine; the site refused the service too. Nothing to configure.
    console.log(
      `  ${YELLOW}Wiring is correct — the service reached the target and the target ` +
        `answered ${payload.targetStatus}. Try SCRAPER_PARAMS=premium_proxies=true, or a ` +
        `different target to confirm the key.${RESET}`
    );
    return;
  }
  console.log(
    `  ${YELLOW}The service answered but the page is not where the preset looked ` +
      `(SCRAPER_HTML_PATH=${provider.htmlPath || "<body itself>"}). ` +
      `Compare the body above with the docs and set SCRAPER_HTML_PATH.${RESET}`
  );
}

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const check = args.includes("--check-scraper");
const urls = args.filter(a => !a.startsWith("--"));

if (!urls.length && !check) {
  console.error(
    "usage: pnpm diagnose:url [--offline] <listing url> [<listing url> …]\n" +
      "       pnpm diagnose:url --check-scraper [<url to fetch through it>]"
  );
  process.exit(1);
}

if (check) {
  // httpbin is the vendor's own example target and costs one credit.
  await checkScraper(urls[0] ?? "https://httpbin.org/ip");
} else {
  console.log(`${BOLD}Listing import diagnosis${RESET}`);
  console.log(`${DIM}scraper: ${JSON.stringify(describeScraper())}${RESET}`);
  for (const url of urls) await diagnose(url, offline);
}
console.log("");
