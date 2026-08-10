/**
 * The extractor across the sites people actually paste.
 *
 * Each fixture is the shape of that site's `<head>` — the tags a server-side
 * fetch really sees, which is rarely the tidy case: attributes in either order,
 * entities, prices only in prose, relative images, ids instead of names, and
 * pages that are nothing but a script tag. What the model does with the facts
 * is its own business; what is pinned here is that the facts reach it.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fetchListingPage,
  hasUsableSignal,
  hintsFromListingUrl,
  looksLikeBotCheck,
  mergeListingHints,
  parseListingHtml,
  resolveListingRedirects,
} from "./listingPage.js";

describe("Booking.com — og tags, reversed attributes, ld+json", () => {
  const url =
    "https://www.booking.com/hotel/si/ti-club.en-gb.html?checkin=2026-08-18&checkout=2026-08-24&group_adults=2&no_rooms=1";
  const html = `<!DOCTYPE html><html><head>
    <title>Ti Club, Ljubljana &ndash; Updated 2026 Prices</title>
    <meta content="Ti Club, Ljubljana &amp; Old Town" property="og:title"/>
    <meta content="Set in Ljubljana, 300 m from the castle. Rooms from &euro;95 per night. Free WiFi and free private parking." property="og:description"/>
    <meta content="https://cf.bstatic.com/xdata/images/hotel/max1024x768/1.jpg" property="og:image"/>
    <script type="application/ld+json">{"@type":"Hotel","name":"Ti Club","address":{"@type":"PostalAddress","addressLocality":"Ljubljana","addressCountry":"SI"},"priceRange":"€95 - €160","aggregateRating":{"@type":"AggregateRating","ratingValue":8.6},"amenityFeature":[{"@type":"LocationFeatureSpecification","name":"Free WiFi"},{"@type":"LocationFeatureSpecification","name":"Free parking"}]}</script>
  </head><body></body></html>`;

  it("gives the model a name, a place, a price and amenities", () => {
    const facts = parseListingHtml(html, url);
    expect(facts.title).toBe("Ti Club, Ljubljana & Old Town");
    expect(facts.description).toContain("€95 per night");
    expect(facts.imageUrl).toContain("cf.bstatic.com");
    expect(facts.structuredData?.[0]).toMatchObject({
      name: "Ti Club",
      address: "Ljubljana, SI",
      priceRange: "€95 - €160",
      amenities: ["Free WiFi", "Free parking"],
    });
    expect(looksLikeBotCheck(facts)).toBe(false);
  });

  it("still names the property when the page is refused", () => {
    const hints = hintsFromListingUrl(url);
    expect(hints).toMatchObject({
      slug: "Ti Club",
      countryCode: "si",
      nights: 6,
    });
    expect(hasUsableSignal(null, hints)).toBe(true);
  });
});

describe("Airbnb — room counts live in the og:description", () => {
  const url =
    "https://www.airbnb.com/rooms/33571268?check_in=2026-08-18&check_out=2026-08-24&adults=4";
  const html = `<html><head>
    <title>Sunny loft · Lisbon</title>
    <meta property="og:title" content="Sunny loft in Alfama · Apartments for Rent in Lisbon"/>
    <meta property="og:description" content="Entire rental unit in Lisbon, Portugal. 4 guests · 2 bedrooms · 3 beds · 1.5 baths. Free parking on premises, Wifi, Kitchen, Washer."/>
    <meta property="og:image" content="https://a0.muscache.com/im/pictures/abc.jpg"/>
  </head></html>`;

  it("keeps the sentence the bed counts are hidden in", () => {
    const facts = parseListingHtml(html, url);
    expect(facts.description).toContain("2 bedrooms · 3 beds · 1.5 baths");
    expect(facts.description).toContain("Free parking");
    expect(facts.title).toContain("Sunny loft in Alfama");
  });

  it("reads the stay from the URL but refuses to name a listing after its id", () => {
    const hints = hintsFromListingUrl(url);
    expect(hints.slug).toBeUndefined();
    expect(hints).toMatchObject({ host: "airbnb.com", nights: 6, adults: 4 });
    // An id-only URL with no page is not worth a model call.
    expect(hasUsableSignal(null, hints)).toBe(false);
  });
});

describe("Vrbo — ld+json only, og tags absent", () => {
  const url =
    "https://www.vrbo.com/1234567ha?arrival=2026-07-03&departure=2026-07-10";
  const html = `<html><head><title>4 Bed Beach House | Vrbo</title>
    <script type="application/ld+json">[{"@type":"BreadcrumbList","itemListElement":[]},{"@type":"VacationRental","name":"Dune House","description":"Four bedrooms, three baths, sleeps 8.","address":{"streetAddress":"12 Ocean Rd","addressLocality":"Outer Banks","addressRegion":"NC","addressCountry":"US"},"numberOfRooms":4,"image":"https://media.vrbo.com/1.jpg"}]</script>
  </head></html>`;

  it("finds the property in an array of schema blocks", () => {
    const facts = parseListingHtml(html, url);
    expect(facts.structuredData).toHaveLength(1);
    expect(facts.structuredData?.[0]).toMatchObject({
      name: "Dune House",
      address: "12 Ocean Rd, Outer Banks, NC, US",
      numberOfRooms: 4,
    });
    expect(looksLikeBotCheck(facts)).toBe(false);
  });
});

describe("Expedia — og tags, single-quoted, no structured data", () => {
  const url =
    "https://www.expedia.com/Barcelona-Hotels-Hotel-Arts.h12345.Hotel-Information?chkin=2026-09-01&chkout=2026-09-04";
  const html = `<html><head>
    <meta property='og:title' content='Hotel Arts Barcelona'/>
    <meta property='og:description' content='5-star beachfront hotel with outdoor pool and spa. Avg. &#36;420 per night.'/>
    <meta name='description' content='Ignored in favour of og:description'/>
  </head></html>`;

  it("prefers og over the plain description and decodes numeric entities", () => {
    const facts = parseListingHtml(html, url);
    expect(facts.title).toBe("Hotel Arts Barcelona");
    expect(facts.description).toContain("$420 per night");
    expect(facts.structuredData).toBeUndefined();
    expect(looksLikeBotCheck(facts)).toBe(false);
  });
});

describe("Agoda — nothing but a <title>", () => {
  const url =
    "https://www.agoda.com/the-sukhothai-bangkok/hotel/bangkok-th.html";
  const html = `<html><head><title>The Sukhothai Bangkok, Bangkok - Updated 2026 Prices</title></head></html>`;

  it("falls back to the title, and the URL still carries the name", () => {
    const facts = parseListingHtml(html, url);
    expect(facts.title).toBe(
      "The Sukhothai Bangkok, Bangkok - Updated 2026 Prices"
    );
    expect(looksLikeBotCheck(facts)).toBe(false);
    // The name is in an earlier segment than the city-and-country one.
    expect(hintsFromListingUrl(url).slug).toBe("The Sukhothai Bangkok");
  });
});

describe("An independent hotel's own site", () => {
  const url = "https://www.hotel-mirabeau.ch/en/rooms/";
  const html = `<html><head>
    <title>H&ocirc;tel Mirabeau &mdash; Zermatt</title>
    <meta property="og:image" content="/assets/hero.jpg">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"LodgingBusiness","name":"Hôtel Mirabeau","address":{"addressLocality":"Zermatt","addressCountry":"CH"},"amenityFeature":[{"name":"Spa"},{"name":"Free WiFi"}],"starRating":{"ratingValue":4}}]}</script>
  </head></html>`;

  it("resolves a relative image and reads the @graph", () => {
    const facts = parseListingHtml(html, url);
    expect(facts.imageUrl).toBe(
      "https://www.hotel-mirabeau.ch/assets/hero.jpg"
    );
    expect(facts.title).toBe("Hôtel Mirabeau — Zermatt");
    expect(facts.structuredData?.[0]).toMatchObject({
      name: "Hôtel Mirabeau",
      address: "Zermatt, CH",
      starRating: 4,
    });
  });
});

describe("Pages with nothing to extract", () => {
  it("treats a client-rendered shell as unreadable", () => {
    const facts = parseListingHtml(
      `<html><head><title></title></head><body><div id="root"></div><script src="/app.js"></script></body></html>`
    );
    expect(looksLikeBotCheck(facts)).toBe(true);
  });

  it("treats an interstitial served with a 200 as blocked", () => {
    const facts = parseListingHtml(
      `<html><head><title>Just a moment...</title><meta name="description" content="Checking your browser before accessing the site."></head></html>`
    );
    expect(looksLikeBotCheck(facts)).toBe(true);
  });
});

describe("URL hints across the sites people paste", () => {
  it.each([
    [
      "https://www.booking.com/hotel/gb/the-savoy.en-gb.html?checkin=2026-05-01&checkout=2026-05-03&group_adults=2",
      { slug: "The Savoy", countryCode: "gb", nights: 2, adults: 2 },
    ],
    [
      "https://www.hotels.com/ho123456/casa-del-mar-sitges-spain/?q-check-in=2026-06-10&q-check-out=2026-06-14",
      { host: "hotels.com", slug: "Casa Del Mar Sitges Spain" },
    ],
    [
      "https://www.agoda.com/the-sukhothai-bangkok/hotel/bangkok-th.html?checkIn=2026-02-01&checkOut=2026-02-05&rooms=2",
      { host: "agoda.com", nights: 4, rooms: 2 },
    ],
    [
      "https://www.tripadvisor.com/Hotel_Review-g187497-d190625-Reviews-Hotel_Arts_Barcelona.html",
      { host: "tripadvisor.com" },
    ],
    [
      // Generic path segments must not become a property called "Rooms".
      "https://www.hotel-mirabeau.ch/en/rooms/?arrival=2026-12-20&departure=2026-12-27&adults=2",
      { host: "hotel-mirabeau.ch", nights: 7, adults: 2 },
    ],
  ])("reads %s", (url, expected) => {
    expect(hintsFromListingUrl(url)).toMatchObject(expected);
  });
});

describe("URLs that name nothing must not be made to name something", () => {
  it.each([
    // Share codes, in the shapes Booking.com hands out. Neither has a vowel
    // outside the word "Share", and neither is anybody's hotel.
    "https://www.booking.com/Share-ZPdrnKD",
    "https://www.booking.com/Share-xTk9pQ",
    "https://www.booking.com/Share-BhkQrTz",
    // Airbnb rooms are a number and nothing else.
    "https://www.airbnb.com/rooms/36276450?check_in=2027-03-05&check_out=2027-03-07",
  ])("finds no property name in %s", url => {
    expect(hintsFromListingUrl(url).slug).toBeUndefined();
  });

  it("still reads the dates a nameless URL does carry", () => {
    expect(
      hintsFromListingUrl(
        "https://www.airbnb.com/rooms/36276450?check_out=2027-03-07&check_in=2027-03-05&adults=1"
      )
    ).toMatchObject({ host: "airbnb.com", nights: 2, adults: 1 });
  });

  it("keeps naming the properties whose URLs really do name them", () => {
    // The vowel-and-case rule that rejects a share code must not reject a hotel.
    for (const [url, slug] of [
      [
        "https://www.booking.com/hotel/nl/grand-amrath-amsterdam.html",
        "Grand Amrath Amsterdam",
      ],
      ["https://www.booking.com/hotel/si/ti-club.en-gb.html", "Ti Club"],
      [
        "https://www.vrbo.com/1234567/villa-flor-mallorca",
        "Villa Flor Mallorca",
      ],
    ] as const) {
      expect(hintsFromListingUrl(url).slug).toBe(slug);
    }
  });
});

describe("resolveListingRedirects — where a share link points", () => {
  afterEach(() => vi.unstubAllGlobals());

  const redirectTo = (location: string, status = 302) =>
    new Response("", { status, headers: { location } });

  it("follows a relative Location to an absolute URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) =>
        input.includes("/Share-")
          ? redirectTo(
              "/hotel/nl/grand-amrath-amsterdam.html?checkin=2026-08-14"
            )
          : new Response("", { status: 403 })
      )
    );
    expect(
      await resolveListingRedirects("https://www.booking.com/Share-ZPdrnKD")
    ).toBe(
      "https://www.booking.com/hotel/nl/grand-amrath-amsterdam.html?checkin=2026-08-14"
    );
  });

  it("says nothing when the link does not redirect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 403 }))
    );
    expect(
      await resolveListingRedirects("https://www.booking.com/hotel/x.html")
    ).toBeUndefined();
  });

  it("gives up on a redirect loop instead of hanging", async () => {
    const spy = vi.fn(async () => redirectTo("https://a.example/b"));
    vi.stubGlobal("fetch", spy);
    expect(await resolveListingRedirects("https://a.example/a")).toBe(
      "https://a.example/b"
    );
    // One hop to learn the destination, one to find it points at itself.
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("will not be redirected into the deployment's own network", async () => {
    const spy = vi.fn(async () =>
      redirectTo("http://169.254.169.254/latest/meta-data/")
    );
    vi.stubGlobal("fetch", spy);
    // Not followed, and not returned either: it would otherwise reach the
    // prompt and be saved as the stay's link.
    expect(
      await resolveListingRedirects("https://a.example/a")
    ).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("Share links — the pasted URL names nothing, the one it lands on does", () => {
  const shared = "https://www.booking.com/Share-xTk9pQ";
  const landed =
    "https://www.booking.com/hotel/si/ti-club.en-gb.html?checkin=2026-08-18&checkout=2026-08-24&group_adults=2";

  it("has nothing to work with before the redirect is followed", () => {
    const hints = hintsFromListingUrl(shared);
    expect(hints.slug).toBeUndefined();
    expect(hasUsableSignal(null, hints)).toBe(false);
  });

  it("names the property once the landing URL is merged in", () => {
    const hints = mergeListingHints(
      hintsFromListingUrl(landed),
      hintsFromListingUrl(shared)
    );
    expect(hints).toMatchObject({
      slug: "Ti Club",
      countryCode: "si",
      nights: 6,
      adults: 2,
    });
    // Blocked at the landing page, and still worth a model call.
    expect(hasUsableSignal(null, hints)).toBe(true);
  });

  it("keeps the stay from the pasted URL and the name from the canonical one", () => {
    const canonical = "https://www.booking.com/hotel/si/ti-club.html";
    const pasted = `${canonical}?checkin=2026-08-18&checkout=2026-08-24&selected_currency=EUR`;
    const hints = mergeListingHints(
      hintsFromListingUrl(canonical),
      hintsFromListingUrl(pasted)
    );
    expect(hints).toMatchObject({
      slug: "Ti Club",
      checkIn: "2026-08-18",
      nights: 6,
      currency: "EUR",
    });
  });

  it("recomputes the stay length when the dates come from different URLs", () => {
    const merged = mergeListingHints(
      { host: "example.com", checkIn: "2026-08-18" },
      { checkOut: "2026-08-20", nights: 9 }
    );
    expect(merged.nights).toBe(2);
  });

  it("drops a stay length it can no longer justify", () => {
    expect(mergeListingHints({ nights: 9 }).nights).toBeUndefined();
  });
});

describe("fetchListingPage — how each kind of answer is classified", () => {
  afterEach(() => vi.unstubAllGlobals());

  const stub = (response: Response | Error) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (response instanceof Error) throw response;
        return response;
      })
    );

  const html = (body: string, init: ResponseInit = {}) =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      ...init,
    });

  it("accepts a normal HTML answer", async () => {
    stub(html("<html><title>Villa</title></html>"));
    const page = await fetchListingPage(
      "https://www.booking.com/hotel/si/x.html"
    );
    expect(page).toMatchObject({ ok: true });
  });

  it.each([401, 403, 429])(
    "reports %i as blocked, not as an error",
    async status => {
      stub(new Response("no", { status }));
      const page = await fetchListingPage(
        "https://www.booking.com/hotel/si/x.html"
      );
      expect(page).toEqual({ ok: false, reason: "blocked", status });
    }
  );

  it("reports a 500 as unreachable", async () => {
    stub(new Response("boom", { status: 500 }));
    expect(await fetchListingPage("https://example.com/x")).toEqual({
      ok: false,
      reason: "unreachable",
      status: 500,
    });
  });

  it("refuses a non-HTML body", async () => {
    stub(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    expect(await fetchListingPage("https://example.com/x.json")).toMatchObject({
      reason: "not-html",
    });
  });

  it("reports a dropped connection as unreachable instead of throwing", async () => {
    stub(new Error("ECONNRESET"));
    expect(await fetchListingPage("https://example.com/x")).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("caps a page that would otherwise fill memory", async () => {
    stub(html(`<title>Big</title>${"x".repeat(2_000_000)}`));
    const page = await fetchListingPage("https://example.com/big");
    expect(page.ok && page.html.length).toBe(1_500_000);
  });

  /** `Response.url` is read-only, and empty on a hand-built one. */
  const landedOn = (response: Response, url: string) => {
    Object.defineProperty(response, "url", { value: url });
    return response;
  };

  it("reports where the redirects ended up", async () => {
    const landed = "https://www.booking.com/hotel/si/ti-club.en-gb.html";
    stub(landedOn(html("<html><title>Ti Club</title></html>"), landed));
    const page = await fetchListingPage("https://www.booking.com/Share-xTk9pQ");
    expect(page).toMatchObject({ ok: true, finalUrl: landed });
  });

  it("reports it even when the page it landed on refused us", async () => {
    const landed = "https://www.booking.com/hotel/si/ti-club.en-gb.html";
    stub(landedOn(new Response("no", { status: 403 }), landed));
    const page = await fetchListingPage("https://www.booking.com/Share-xTk9pQ");
    expect(page).toEqual({
      ok: false,
      reason: "blocked",
      status: 403,
      finalUrl: landed,
    });
  });

  it("stays quiet when nothing redirected", async () => {
    const url = "https://example.com/x";
    stub(landedOn(html("<html><title>Villa</title></html>"), url));
    expect(await fetchListingPage(url)).toEqual({
      ok: true,
      html: "<html><title>Villa</title></html>",
    });
  });

  it("never leaves the public internet", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchListingPage("http://127.0.0.1:5000/admin")).toMatchObject(
      {
        ok: false,
      }
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
