/**
 * The scraper fallback as the import path sees it: one call that either hands
 * back HTML or says why it could not, and never throws.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeScraper,
  isScraperConfigured,
  scrapeListingPage,
} from "./index.js";

function useScrapingowl(extra: Record<string, string> = {}) {
  vi.stubEnv("SCRAPER_PROVIDER", "scrapingowl");
  vi.stubEnv("SCRAPER_API_KEY", "owl-key");
  for (const [key, value] of Object.entries(extra)) vi.stubEnv(key, value);
}

function answerWith(
  body: string,
  { status = 200, contentType = "application/json" } = {}
) {
  const spy = vi.fn(
    async () =>
      new Response(body, {
        status,
        headers: { "content-type": contentType },
      })
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("configuration", () => {
  it("is off unless a key is set", () => {
    expect(isScraperConfigured()).toBe(false);
    vi.stubEnv("SCRAPER_PROVIDER", "scrapingowl");
    expect(isScraperConfigured()).toBe(false);
    vi.stubEnv("SCRAPER_API_KEY", "owl-key");
    expect(isScraperConfigured()).toBe(true);
  });

  it("assumes the default vendor when only the key is configured", () => {
    // Pasting the key into Doppler and expecting imports to work is the whole
    // setup most people will do; it must not fail silently as "site blocked us".
    vi.stubEnv("SCRAPER_API_KEY", "owl-key");
    expect(isScraperConfigured()).toBe(true);
    expect(describeScraper()).toMatchObject({
      enabled: true,
      provider: "scrapingowl",
    });
  });

  it("summarises itself without ever naming the key", () => {
    useScrapingowl();
    const summary = JSON.stringify(describeScraper());
    expect(summary).toContain("scrapingowl");
    expect(summary).not.toContain("owl-key");
  });

  it("refuses to call anything when it is off", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const result = await scrapeListingPage("https://www.booking.com/x");
    expect(result).toEqual({ ok: false, reason: "not-configured" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports a misconfiguration instead of crashing the import", async () => {
    vi.stubEnv("SCRAPER_PROVIDER", "typo-service");
    vi.stubEnv("SCRAPER_API_KEY", "k");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await scrapeListingPage("https://www.booking.com/x")).toMatchObject({
      ok: false,
      reason: "misconfigured",
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("a scrape that works", () => {
  it("returns the page the service fetched for us", async () => {
    useScrapingowl();
    const spy = answerWith(
      JSON.stringify({
        status: 200,
        html: '<html><head><meta property="og:title" content="Grand Hotel Amrath"></head></html>',
      })
    );
    const result = await scrapeListingPage(
      "https://www.booking.com/hotel/nl/grand-amrath-amsterdam.html"
    );
    expect(result).toMatchObject({ ok: true, provider: "scrapingowl" });
    expect(result.ok && result.html).toContain("Grand Hotel Amrath");

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    const called = new URL(url);
    expect(called.origin + called.pathname).toBe(
      "https://api.scrapeowl.com/v1/scrape"
    );
    expect(init.method).toBe("GET");
    expect(called.searchParams.get("url")).toContain("grand-amrath-amsterdam");
  });

  it("passes the target URL through untouched, query string and all", async () => {
    useScrapingowl();
    const target =
      "https://www.airbnb.com/rooms/36276450?check_in=2027-03-05&check_out=2027-03-07";
    const spy = answerWith(
      JSON.stringify({ status: 200, html: "<html></html>" })
    );
    await scrapeListingPage(target);
    const called = new URL(spy.mock.calls[0][0] as string);
    expect(called.searchParams.get("url")).toBe(target);
  });

  it("takes the page even when the service skips its JSON envelope", async () => {
    useScrapingowl();
    answerWith(
      `<!doctype html><html><head><meta property="og:title" content="Grand">${"<meta name=x content=y>".repeat(30)}</head></html>`,
      { contentType: "text/html" }
    );
    const result = await scrapeListingPage("https://www.booking.com/x");
    expect(result.ok && result.html).toContain("og:title");
  });
});

describe("a scrape that does not work", () => {
  it("classifies the service refusing us (bad key, no credit) separately from the site", async () => {
    useScrapingowl();
    answerWith(JSON.stringify({ error: "invalid api key" }), { status: 401 });
    expect(await scrapeListingPage("https://www.booking.com/x")).toMatchObject({
      ok: false,
      reason: "provider-error",
      status: 401,
    });
  });

  it("classifies the service reaching the site and being blocked", async () => {
    useScrapingowl();
    answerWith(JSON.stringify({ status: 403, error: "target refused" }));
    expect(await scrapeListingPage("https://www.booking.com/x")).toMatchObject({
      ok: false,
      reason: "blocked",
    });
  });

  it("survives a service that answers with something that is not JSON", async () => {
    useScrapingowl();
    answerWith("<!doctype html><h1>502 Bad Gateway</h1>", {
      contentType: "text/html",
    });
    expect(await scrapeListingPage("https://www.booking.com/x")).toMatchObject({
      ok: false,
      reason: "provider-error",
    });
  });

  it("survives the service being unreachable", async () => {
    useScrapingowl();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      })
    );
    expect(await scrapeListingPage("https://www.booking.com/x")).toMatchObject({
      ok: false,
      reason: "unreachable",
    });
  });

  it("will not send a private address to a third party", async () => {
    useScrapingowl();
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(
      await scrapeListingPage("http://127.0.0.1:5000/admin")
    ).toMatchObject({ ok: false, reason: "unreachable" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("caps an enormous page instead of holding it all in memory", async () => {
    useScrapingowl();
    answerWith(JSON.stringify({ status: 200, html: "x".repeat(3_000_000) }));
    const result = await scrapeListingPage("https://www.booking.com/x");
    expect(result.ok && result.html.length).toBeLessThanOrEqual(1_500_000);
  });
});

describe("host allow-list", () => {
  it("spends the quota on every host by default", async () => {
    useScrapingowl();
    const spy = answerWith(
      JSON.stringify({ status: 200, html: "<html></html>" })
    );
    await scrapeListingPage("https://some-small-hotel.example/room");
    expect(spy).toHaveBeenCalled();
  });

  it("spends it only on the named hosts when the operator narrows it", async () => {
    useScrapingowl({ SCRAPER_HOSTS: "booking.com,expedia.com" });
    const spy = answerWith(
      JSON.stringify({ status: 200, html: "<html></html>" })
    );

    expect(
      await scrapeListingPage("https://some-small-hotel.example/room")
    ).toMatchObject({ ok: false, reason: "host-not-allowed" });
    expect(spy).not.toHaveBeenCalled();

    // Subdomains of a listed host count; a host that merely ends in it does not.
    await scrapeListingPage("https://www.booking.com/hotel/nl/x.html");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await scrapeListingPage("https://notbooking.com/x")).toMatchObject({
      ok: false,
      reason: "host-not-allowed",
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
