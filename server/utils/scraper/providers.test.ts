/**
 * Turning env vars into an HTTP request to whichever unblocking service is
 * configured. All of this is pure — no service is contacted here.
 */
import { describe, expect, it } from "vitest";
import {
  buildScrapeRequest,
  listScraperPresets,
  readScrapedPage,
  resolveScraperProvider,
} from "./providers.js";

const TARGET =
  "https://www.booking.com/hotel/nl/grand-amrath-amsterdam.html?checkin=2026-08-14";

describe("resolveScraperProvider", () => {
  it("is disabled when no provider is named", () => {
    expect(resolveScraperProvider({ provider: "", apiKey: "k" })).toBeNull();
  });

  it("is disabled when a provider is named but has no key", () => {
    expect(
      resolveScraperProvider({ provider: "scrapingowl", apiKey: "" })
    ).toBeNull();
  });

  it("rejects an unknown provider rather than guessing an endpoint", () => {
    expect(() =>
      resolveScraperProvider({ provider: "not-a-service", apiKey: "k" })
    ).toThrow(/SCRAPER_PROVIDER/);
  });

  it("ships presets for the services people actually use", () => {
    // The point of the preset list: switching vendor is one env var, not a PR.
    expect(listScraperPresets()).toEqual(
      expect.arrayContaining([
        "scrapingowl",
        "scrapingbee",
        "scraperapi",
        "zenrows",
        "scrapfly",
        "custom",
      ])
    );
  });

  it("accepts the spellings people write scrapingowl with", () => {
    for (const name of ["scrapingowl", "ScrapeOwl", "scraping-owl"]) {
      expect(
        resolveScraperProvider({ provider: name, apiKey: "k" })?.name
      ).toBe("scrapingowl");
    }
  });
});

describe("scrapingowl", () => {
  const provider = resolveScraperProvider({
    provider: "scrapingowl",
    apiKey: "owl-key",
  })!;

  // The shape confirmed against a real key:
  //   curl "https://api.scrapeowl.com/v1/scrape?api_key=…&url=…"
  it("gets the endpoint with the key and the target URL in the query", () => {
    const request = buildScrapeRequest(provider, TARGET, { renderJs: true });
    expect(request.method).toBe("GET");
    expect(request.body).toBeUndefined();
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe(
      "https://api.scrapeowl.com/v1/scrape"
    );
    expect(url.searchParams.get("api_key")).toBe("owl-key");
    // The target keeps its own query string; `searchParams` encodes it for us.
    expect(url.searchParams.get("url")).toBe(TARGET);
    expect(url.searchParams.get("render_js")).toBe("true");
  });

  it("says so explicitly when rendering is turned off", () => {
    const request = buildScrapeRequest(provider, TARGET, { renderJs: false });
    expect(new URL(request.url).searchParams.get("render_js")).toBe("false");
  });

  it("moves the key into a JSON body when the operator prefers POST", () => {
    // ScrapeOwl takes both; switching is two env vars, not a code change.
    const posting = resolveScraperProvider({
      provider: "scrapingowl",
      apiKey: "owl-key",
      method: "POST",
      apiKeyIn: "body",
    })!;
    const request = buildScrapeRequest(posting, TARGET, { renderJs: true });
    expect(request.method).toBe("POST");
    expect(request.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(request.body!)).toMatchObject({
      api_key: "owl-key",
      url: TARGET,
      render_js: true,
    });
  });

  it("reads the HTML out of the JSON envelope", () => {
    const page = readScrapedPage(
      provider,
      "application/json",
      JSON.stringify({ status: 200, html: "<html><title>Grand</title></html>" })
    );
    expect(page.html).toContain("<title>Grand</title>");
  });

  it("reports the service's own failure instead of returning its error JSON as a page", () => {
    const page = readScrapedPage(
      provider,
      "application/json",
      JSON.stringify({ status: 403, error: "blocked by target" })
    );
    expect(page.html).toBeUndefined();
    expect(page.error).toMatch(/blocked by target/);
  });

  it("takes a bare page as the page, even though it expected an envelope", () => {
    // Endpoints and plans differ on whether the reply is wrapped. Refusing a
    // page we are plainly holding would be the worst possible answer.
    const bare = `<!doctype html><html><head><title>Grand</title>${"<meta name=x content=y>".repeat(30)}</head></html>`;
    expect(readScrapedPage(provider, "text/html", bare).html).toContain(
      "<title>Grand</title>"
    );
  });

  it("refuses a body that is neither an envelope nor a page", () => {
    const page = readScrapedPage(provider, "text/plain", "Gateway timeout");
    expect(page.html).toBeUndefined();
    expect(page.error).toMatch(/expected JSON/);
  });

  it("refuses a scrap of HTML that is an error page, not a listing", () => {
    // Otherwise a stay ends up named "502 Bad Gateway".
    const page = readScrapedPage(
      provider,
      "text/html",
      "<!doctype html><h1>502 Bad Gateway</h1>"
    );
    expect(page.html).toBeUndefined();
  });
});

describe("providers that answer with the page itself", () => {
  it("scrapingbee puts everything in the query string", () => {
    const provider = resolveScraperProvider({
      provider: "scrapingbee",
      apiKey: "bee-key",
    })!;
    const request = buildScrapeRequest(provider, TARGET, { renderJs: true });
    const url = new URL(request.url);
    expect(request.method).toBe("GET");
    expect(url.origin + url.pathname).toBe(
      "https://app.scrapingbee.com/api/v1"
    );
    expect(url.searchParams.get("api_key")).toBe("bee-key");
    // The target URL must survive intact — its own query string included.
    expect(url.searchParams.get("url")).toBe(TARGET);
    expect(url.searchParams.get("render_js")).toBe("true");
    expect(request.body).toBeUndefined();
  });

  it("scraperapi and zenrows differ only in parameter names", () => {
    const scraperapi = buildScrapeRequest(
      resolveScraperProvider({ provider: "scraperapi", apiKey: "k" })!,
      TARGET,
      { renderJs: true }
    );
    expect(new URL(scraperapi.url).searchParams.get("render")).toBe("true");

    const zenrows = buildScrapeRequest(
      resolveScraperProvider({ provider: "zenrows", apiKey: "k" })!,
      TARGET,
      { renderJs: true }
    );
    expect(new URL(zenrows.url).searchParams.get("apikey")).toBe("k");
    expect(new URL(zenrows.url).searchParams.get("js_render")).toBe("true");
  });

  it("takes the body as the page when the service returns HTML", () => {
    const provider = resolveScraperProvider({
      provider: "scrapingbee",
      apiKey: "k",
    })!;
    const page = readScrapedPage(provider, "text/html", "<html>hi</html>");
    expect(page.html).toBe("<html>hi</html>");
  });
});

describe("switching service without touching the code", () => {
  it("overrides every part of a preset from env", () => {
    const provider = resolveScraperProvider({
      provider: "scrapingowl",
      apiKey: "k",
      endpoint: "https://api.example.test/v2/fetch",
      method: "GET",
      urlParam: "target",
      apiKeyParam: "token",
      apiKeyIn: "header",
      params: "country=nl&premium=true",
      htmlPath: "data.content",
    })!;
    const request = buildScrapeRequest(provider, TARGET, { renderJs: true });
    const url = new URL(request.url);
    expect(url.origin + url.pathname).toBe("https://api.example.test/v2/fetch");
    expect(url.searchParams.get("target")).toBe(TARGET);
    expect(url.searchParams.get("country")).toBe("nl");
    expect(url.searchParams.get("premium")).toBe("true");
    expect(request.headers.token).toBe("k");
    expect(url.searchParams.get("token")).toBeNull();

    const page = readScrapedPage(
      provider,
      "application/json",
      JSON.stringify({ data: { content: "<html>via override</html>" } })
    );
    expect(page.html).toBe("<html>via override</html>");
  });

  it("describes a whole service from env alone, with no preset behind it", () => {
    const provider = resolveScraperProvider({
      provider: "custom",
      apiKey: "k",
      endpoint: "https://unblock.example.test/get",
      urlParam: "page_url",
      apiKeyParam: "x-api-key",
      apiKeyIn: "header",
    })!;
    const request = buildScrapeRequest(provider, TARGET, { renderJs: true });
    expect(request.headers["x-api-key"]).toBe("k");
    expect(new URL(request.url).searchParams.get("page_url")).toBe(TARGET);
  });

  it("refuses a custom provider with no endpoint rather than posting the key somewhere unintended", () => {
    expect(() =>
      resolveScraperProvider({ provider: "custom", apiKey: "k" })
    ).toThrow(/SCRAPER_ENDPOINT/);
  });

  it("carries extra parameters into the query of a GET service", () => {
    const provider = resolveScraperProvider({
      provider: "scrapingowl",
      apiKey: "k",
      params: "country=nl&premium_proxies=true",
    })!;
    const url = new URL(
      buildScrapeRequest(provider, TARGET, { renderJs: true }).url
    );
    expect(url.searchParams.get("country")).toBe("nl");
    expect(url.searchParams.get("premium_proxies")).toBe("true");
  });

  /** The same extras, for a service configured to take a JSON body instead. */
  const posting = (params: string) =>
    JSON.parse(
      buildScrapeRequest(
        resolveScraperProvider({
          provider: "scrapingowl",
          apiKey: "k",
          method: "POST",
          apiKeyIn: "body",
          params,
        })!,
        TARGET,
        { renderJs: true }
      ).body!
    );

  it("takes extra parameters as JSON too, for values a query string would mangle", () => {
    expect(
      posting(
        '{"country":"nl","wait_for":".hprt-table","premium_proxies":true}'
      )
    ).toMatchObject({
      country: "nl",
      wait_for: ".hprt-table",
      premium_proxies: true,
    });
  });

  it("coerces query-string extras to JSON types for a JSON-bodied service", () => {
    const body = posting("premium_proxies=true&wait=3000&country=nl");
    expect(body.premium_proxies).toBe(true);
    expect(body.wait).toBe(3000);
    expect(body.country).toBe("nl");
  });
});
