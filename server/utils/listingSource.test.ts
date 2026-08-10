/**
 * The import ladder, against the URLs people actually paste.
 *
 * Each case names the rung that should answer and the rungs that must not be
 * climbed — a scrape that costs money must never run when the site handed us
 * the page, and must always run when it did not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./placeLookup.js", async importOriginal => ({
  ...(await importOriginal<typeof import("./placeLookup.js")>()),
  lookupPlace: vi.fn(async () => null),
}));
vi.mock("./scraper/index.js", () => ({
  isScraperConfigured: vi.fn(() => false),
  scrapeListingPage: vi.fn(async () => ({
    ok: false as const,
    reason: "not-configured" as const,
  })),
  describeScraper: () => ({ enabled: false, provider: "none" }),
}));

import { resolveListingSource } from "./listingSource.js";
import { lookupPlace } from "./placeLookup.js";
import { isScraperConfigured, scrapeListingPage } from "./scraper/index.js";

const SHARE_URL = "https://www.booking.com/Share-ZPdrnKD";
const BOOKING_URL =
  "https://www.booking.com/hotel/nl/grand-amrath-amsterdam.html?aid=337862&label=hotel_details-ZPdrnKD%401786330749&sid=eca9244a871ce8a41452f1552dbfa58c&checkin=2026-08-14&checkout=2026-08-16&dist=0&from_sn=android&group_adults=2&group_children=0&keep_landing=1&no_rooms=1&req_adults=2&req_children=0&room1=A%2CA&sb_price_type=total&type=total";
const AIRBNB_URL =
  "https://www.airbnb.com/rooms/36276450?check_in=2027-03-05&check_out=2027-03-07&photo_id=1722908008&source_impression_id=p3_1786330838_P31VQoVfJzIA3a7V";

const AIRBNB_HTML = `<html><head>
  <title>Loft with a canal view - Apartments for Rent in Amsterdam</title>
  <meta property="og:title" content="Loft with a canal view · Amsterdam"/>
  <meta property="og:description" content="Entire rental unit in Amsterdam. 2 bedrooms, 1 bathroom, sleeps 4. €180 per night."/>
  <meta property="og:image" content="https://a0.muscache.com/im/pictures/1.jpg"/>
</head><body></body></html>`;

const BOT_CHECK_HTML = `<html><head><title>Just a moment…</title>
  <meta name="description" content="Please verify you are a human"/></head><body></body></html>`;

/** Whatever the site is asked, it answers this. */
function siteAnswers(
  answer:
    | { status: number; body: string; contentType?: string }
    | { throws: true }
) {
  const spy = vi.fn(async () => {
    if ("throws" in answer) throw new Error("ECONNRESET");
    return new Response(answer.body, {
      status: answer.status,
      headers: { "content-type": answer.contentType ?? "text/html" },
    });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function scraperReturns(html: string, finalUrl?: string) {
  vi.mocked(isScraperConfigured).mockReturnValue(true);
  vi.mocked(scrapeListingPage).mockResolvedValue({
    ok: true,
    html,
    provider: "scrapingowl",
    ...(finalUrl ? { finalUrl } : {}),
  } as Awaited<ReturnType<typeof scrapeListingPage>>);
}

beforeEach(() => {
  vi.mocked(isScraperConfigured).mockReturnValue(false);
  vi.mocked(scrapeListingPage).mockResolvedValue({
    ok: false,
    reason: "not-configured",
  });
  vi.mocked(lookupPlace).mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the site answers — nothing else runs", () => {
  it("uses the page and spends no scraper credit", async () => {
    scraperReturns("<html>should not be used</html>");
    siteAnswers({ status: 200, body: AIRBNB_HTML });

    const result = await resolveListingSource({ url: AIRBNB_URL });

    expect(result.source).toBe("page");
    expect(result.facts?.title).toBe("Loft with a canal view · Amsterdam");
    expect(result.blocked).toBe(false);
    expect(scrapeListingPage).not.toHaveBeenCalled();
    expect(lookupPlace).not.toHaveBeenCalled();
  });
});

describe("Booking.com refuses us", () => {
  it("without a scraper, degrades to the URL and the map, exactly as before", async () => {
    siteAnswers({ status: 403, body: "" });
    vi.mocked(lookupPlace).mockResolvedValue({
      name: "Grand Hotel Amrâth Amsterdam",
      address: "Prins Hendrikkade 108, Amsterdam, Netherlands",
    });

    const result = await resolveListingSource({ url: BOOKING_URL });

    expect(result.source).toBe("place");
    expect(result.blocked).toBe(true);
    expect(result.hints).toMatchObject({
      slug: "Grand Amrath Amsterdam",
      countryCode: "nl",
      nights: 2,
      adults: 2,
    });
    expect(lookupPlace).toHaveBeenCalledWith(
      "Grand Amrath Amsterdam, Netherlands"
    );
    // Still no price: a map lookup never knows what this stay costs.
    expect(result.facts).toBeNull();
  });

  it("with a scraper, reads the real page and stops being blocked", async () => {
    siteAnswers({ status: 403, body: "" });
    scraperReturns(`<html><head>
      <meta property="og:title" content="Grand Hotel Amrâth Amsterdam"/>
      <meta property="og:description" content="5-star hotel on Prins Hendrikkade. Total for 2 nights: €612."/>
      <script type="application/ld+json">{"@type":"Hotel","name":"Grand Hotel Amrâth Amsterdam","address":{"addressLocality":"Amsterdam","addressCountry":"NL"}}</script>
    </head></html>`);

    const result = await resolveListingSource({ url: BOOKING_URL });

    expect(result.source).toBe("scraper");
    expect(result.blocked).toBe(false);
    expect(result.facts?.title).toBe("Grand Hotel Amrâth Amsterdam");
    expect(result.facts?.description).toContain("€612");
    expect(lookupPlace).not.toHaveBeenCalled();
  });

  it("treats a 200 that is really a robot check as a refusal and scrapes", async () => {
    siteAnswers({ status: 200, body: BOT_CHECK_HTML });
    scraperReturns(AIRBNB_HTML);

    const result = await resolveListingSource({ url: BOOKING_URL });

    expect(scrapeListingPage).toHaveBeenCalledOnce();
    expect(result.source).toBe("scraper");
  });

  it("falls the rest of the way down the ladder when the scrape also fails", async () => {
    siteAnswers({ status: 403, body: "" });
    vi.mocked(isScraperConfigured).mockReturnValue(true);
    vi.mocked(scrapeListingPage).mockResolvedValue({
      ok: false,
      reason: "blocked",
      provider: "scrapingowl",
    });
    vi.mocked(lookupPlace).mockResolvedValue({ name: "Grand Hotel Amrâth" });

    const result = await resolveListingSource({ url: BOOKING_URL });

    expect(result.source).toBe("place");
    // The member still gets the paste box — that is what `blocked` is for.
    expect(result.blocked).toBe(true);
  });
});

describe("a share link", () => {
  it("never names the stay after the share code", async () => {
    siteAnswers({ status: 403, body: "" });

    const result = await resolveListingSource({ url: SHARE_URL });

    // "Share ZPdrnKD" is a tracking code, not a property. Better nothing.
    expect(result.hints.slug).toBeUndefined();
    expect(lookupPlace).not.toHaveBeenCalled();
    expect(result.source).toBe("none");
  });

  it("follows the redirect the share link exists to perform", async () => {
    // Booking answers the share link with a 302 and only then puts up the
    // robot check, so the redirect is readable when the page is not.
    const spy = vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.redirect === "manual" && input === SHARE_URL)
        return new Response("", {
          status: 302,
          headers: {
            location:
              "/hotel/nl/grand-amrath-amsterdam.html?checkin=2026-08-14&checkout=2026-08-16",
          },
        });
      return new Response("", { status: 403 });
    });
    vi.stubGlobal("fetch", spy);
    vi.mocked(lookupPlace).mockResolvedValue({
      name: "Grand Hotel Amrâth Amsterdam",
    });

    const result = await resolveListingSource({ url: SHARE_URL });

    expect(result.resolvedUrl).toContain("grand-amrath-amsterdam");
    expect(result.hints).toMatchObject({
      slug: "Grand Amrath Amsterdam",
      countryCode: "nl",
      nights: 2,
    });
    expect(result.source).toBe("place");
  });

  it("scrapes the URL the redirect landed on, not the share code", async () => {
    const spy = vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.redirect === "manual")
        return new Response("", {
          status: 302,
          headers: {
            location:
              "https://www.booking.com/hotel/nl/grand-amrath-amsterdam.html",
          },
        });
      return new Response("", { status: 403 });
    });
    vi.stubGlobal("fetch", spy);
    scraperReturns(AIRBNB_HTML);

    await resolveListingSource({ url: SHARE_URL });

    expect(scrapeListingPage).toHaveBeenCalledWith(
      expect.stringContaining("grand-amrath-amsterdam")
    );
  });
});

describe("an Airbnb room URL, which encodes nothing but a number", () => {
  it("today: a refusal leaves absolutely nothing to extract", async () => {
    siteAnswers({ status: 403, body: "" });

    const result = await resolveListingSource({ url: AIRBNB_URL });

    // No slug to look up, no page, no paste — this is the total failure the
    // scraper fallback exists to fix.
    expect(result.hints.slug).toBeUndefined();
    expect(result.hints).toMatchObject({ checkIn: "2027-03-05", nights: 2 });
    expect(result.source).toBe("none");
    expect(result.usable).toBe(false);
  });

  it("with a scraper: the page arrives and the room is named", async () => {
    siteAnswers({ status: 403, body: "" });
    scraperReturns(AIRBNB_HTML);

    const result = await resolveListingSource({ url: AIRBNB_URL });

    expect(result.source).toBe("scraper");
    expect(result.usable).toBe(true);
    expect(result.facts?.description).toContain("2 bedrooms");
  });
});

describe("the paste the member made in their own browser", () => {
  it("outranks every other rung and touches no network at all", async () => {
    const spy = siteAnswers({ status: 200, body: AIRBNB_HTML });
    scraperReturns(AIRBNB_HTML);

    const result = await resolveListingSource({
      url: BOOKING_URL,
      pageText: [
        "Grand Hotel Amrâth Amsterdam",
        "Prins Hendrikkade 108, Amsterdam",
        "Total for 2 nights: €612",
        "Free WiFi",
      ].join("\n"),
    });

    expect(result.source).toBe("paste");
    expect(result.pastedText).toContain("€612");
    expect(spy).not.toHaveBeenCalled();
    expect(scrapeListingPage).not.toHaveBeenCalled();
    expect(lookupPlace).not.toHaveBeenCalled();
  });

  it("ignores a paste too short to be a page", async () => {
    siteAnswers({ status: 200, body: AIRBNB_HTML });
    const result = await resolveListingSource({
      url: AIRBNB_URL,
      pageText: "oops",
    });
    expect(result.source).toBe("page");
  });
});
