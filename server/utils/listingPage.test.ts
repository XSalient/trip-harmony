import { describe, expect, it } from "vitest";
import {
  cleanListingUrl,
  coerceExtractedAccommodation,
  decodeHtmlEntities,
  hasUsableSignal,
  hintsFromListingUrl,
  isFetchableListingUrl,
  looksLikeBotCheck,
  parseListingHtml,
  toCount,
  toDecimalString,
} from "./listingPage.js";

/** The URL from the bug report: heavy on tracking, light on anything obvious. */
const bookingUrl =
  "https://www.booking.com/hotel/si/ti-club.en-gb.html?label=stuttgart-Otx1pBnwY3c4zSKICOs6FgS379617597006%3Apl%3Ata%3Ap1%3Ap2%3Aac%3Aap%3Aneg%3Afi%3Atikwd-300191668022%3Alp9191292%3Ali%3Adec%3Adm%3Appccp%3DUmFuZG9tSVYkc2RlIyh9YfqnDqqG8nt10AsofPfvtt0&aid=1610684&ucfs=1&checkin=2026-08-18&checkout=2026-08-24&dest_id=5699&dest_type=region&group_adults=2&no_rooms=1&group_children=1&age=6&req_age=6&srpvid=6307505f63b80a4c&srepoch=1785583721&all_sr_blocks=764125903_438290180_3_0_0&highlighted_blocks=764125903_438290180_3_0_0&matching_block_id=764125903_438290180_3_0_0&atlas_src=sr_iw_title#_";

describe("hintsFromListingUrl", () => {
  it("reads the property, country and stay out of a Booking.com URL", () => {
    expect(hintsFromListingUrl(bookingUrl)).toEqual({
      host: "booking.com",
      slug: "Ti Club",
      countryCode: "si",
      checkIn: "2026-08-18",
      checkOut: "2026-08-24",
      nights: 6,
      adults: 2,
      children: 1,
      rooms: 1,
    });
  });

  it("does not turn an opaque listing id into a name", () => {
    const hints = hintsFromListingUrl(
      "https://www.airbnb.com/rooms/48219473?check_in=2026-09-01&check_out=2026-09-05&adults=4"
    );
    expect(hints.slug).toBeUndefined();
    expect(hints.nights).toBe(4);
    expect(hints.adults).toBe(4);
  });

  it("survives a URL it knows nothing about", () => {
    expect(hintsFromListingUrl("not a url")).toEqual({});
    expect(hintsFromListingUrl("https://example.com/")).toEqual({
      host: "example.com",
    });
  });
});

describe("cleanListingUrl", () => {
  it("drops the tracking payload but keeps the stay", () => {
    const cleaned = cleanListingUrl(bookingUrl);
    expect(cleaned).not.toContain("label=");
    expect(cleaned).not.toContain("srpvid=");
    expect(cleaned).not.toContain("aid=");
    expect(cleaned).not.toContain("#");
    expect(cleaned).toContain("checkin=2026-08-18");
    expect(cleaned).toContain("checkout=2026-08-24");
    expect(cleaned).toContain("/hotel/si/ti-club.en-gb.html");
  });

  it("returns unparseable input untouched", () => {
    expect(cleanListingUrl("nonsense")).toBe("nonsense");
  });
});

describe("parseListingHtml", () => {
  it("reads Open Graph tags whatever order the attributes come in", () => {
    const facts = parseListingHtml(
      `<html><head>
        <title>Ti Club, Ljubljana &ndash; Updated 2026 Prices</title>
        <meta content="Ti Club &amp; Spa" property="og:title">
        <meta property="og:description" content="Set in Ljubljana&#39;s old town, 300 m from the castle." />
        <meta property='og:image' content='/static/hotel.jpg'>
        <link rel="canonical" href="https://www.booking.com/hotel/si/ti-club.html">
      </head></html>`,
      "https://www.booking.com/hotel/si/ti-club.en-gb.html"
    );
    expect(facts.title).toBe("Ti Club & Spa");
    expect(facts.description).toBe(
      "Set in Ljubljana's old town, 300 m from the castle."
    );
    expect(facts.imageUrl).toBe("https://www.booking.com/static/hotel.jpg");
    expect(facts.canonicalUrl).toBe(
      "https://www.booking.com/hotel/si/ti-club.html"
    );
  });

  it("falls back to <title> and the plain description meta", () => {
    const facts = parseListingHtml(
      `<html><head><title>Beach House</title>
       <meta name="description" content="Two bedrooms by the sea."></head></html>`
    );
    expect(facts.title).toBe("Beach House");
    expect(facts.description).toBe("Two bedrooms by the sea.");
  });

  it("pulls the useful fields out of schema.org data, including @graph", () => {
    const facts = parseListingHtml(
      `<script type="application/ld+json">${JSON.stringify({
        "@graph": [
          { "@type": "BreadcrumbList", itemListElement: [] },
          {
            "@type": "Hotel",
            name: "Ti Club",
            address: {
              "@type": "PostalAddress",
              addressLocality: "Ljubljana",
              addressCountry: "SI",
            },
            priceRange: "€90 - €160",
            aggregateRating: { ratingValue: 8.6 },
            amenityFeature: [{ name: "Free WiFi" }, { name: "Free parking" }],
          },
        ],
      })}</script>`
    );
    expect(facts.structuredData).toEqual([
      {
        type: "Hotel",
        name: "Ti Club",
        address: "Ljubljana, SI",
        priceRange: "€90 - €160",
        rating: 8.6,
        amenities: ["Free WiFi", "Free parking"],
      },
    ]);
  });

  it("ignores a malformed ld+json block instead of throwing", () => {
    expect(() =>
      parseListingHtml(
        `<script type="application/ld+json">{not json</script><title>Villa</title>`
      )
    ).not.toThrow();
  });
});

describe("looksLikeBotCheck", () => {
  it("recognises a refusal served with a 200", () => {
    expect(looksLikeBotCheck({ title: "Are you a robot?" })).toBe(true);
    expect(looksLikeBotCheck({ title: "Just a moment..." })).toBe(true);
    expect(looksLikeBotCheck({})).toBe(true);
  });

  it("accepts a real listing", () => {
    expect(
      looksLikeBotCheck({
        title: "Ti Club, Ljubljana",
        description: "Set in the old town",
      })
    ).toBe(false);
  });

  it("trusts structured data over a suspicious title", () => {
    expect(
      looksLikeBotCheck({
        title: "Security check",
        structuredData: [{ name: "Ti Club" }],
      })
    ).toBe(false);
  });
});

describe("hasUsableSignal", () => {
  it("is true when the URL alone names the property", () => {
    expect(hasUsableSignal(null, hintsFromListingUrl(bookingUrl))).toBe(true);
  });

  it("is false when a blocked page leaves an opaque URL", () => {
    expect(
      hasUsableSignal(
        null,
        hintsFromListingUrl("https://www.airbnb.com/rooms/48219473")
      )
    ).toBe(false);
  });
});

describe("isFetchableListingUrl", () => {
  it("allows public http(s) listings", () => {
    expect(isFetchableListingUrl(bookingUrl)).toBe(true);
  });

  it("refuses other schemes and the deployment's own network", () => {
    expect(isFetchableListingUrl("file:///etc/passwd")).toBe(false);
    expect(isFetchableListingUrl("http://localhost:5000/api/health")).toBe(
      false
    );
    expect(
      isFetchableListingUrl("http://169.254.169.254/latest/meta-data")
    ).toBe(false);
    expect(isFetchableListingUrl("http://10.0.0.5/admin")).toBe(false);
  });
});

describe("toDecimalString", () => {
  it("strips currency and thousands separators", () => {
    expect(toDecimalString("€1,234.50")).toBe("1234.5");
    expect(toDecimalString("1.234,56 EUR")).toBe("1234.56");
    expect(toDecimalString("1,234")).toBe("1234");
    expect(toDecimalString("USD 89")).toBe("89");
    expect(toDecimalString(120)).toBe("120");
  });

  it("rejects what is not a price", () => {
    expect(toDecimalString("ask the host")).toBeUndefined();
    expect(toDecimalString(null)).toBeUndefined();
    expect(toDecimalString(-5)).toBeUndefined();
  });
});

describe("toCount", () => {
  it("rounds to whole rooms and refuses nonsense", () => {
    expect(toCount("2")).toBe(2);
    expect(toCount(1.5)).toBe(2);
    expect(toCount("3 bedrooms")).toBe(3);
    expect(toCount("many")).toBeUndefined();
    expect(toCount(999)).toBeUndefined();
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    expect(decodeHtmlEntities("Ti Club &amp; Spa &#8212; 6&nbsp;nights")).toBe(
      "Ti Club & Spa — 6 nights"
    );
    expect(decodeHtmlEntities("caf&#xe9;")).toBe("café");
    expect(decodeHtmlEntities("&unknownentity;")).toBe("&unknownentity;");
  });
});

describe("coerceExtractedAccommodation", () => {
  it("shapes model output into what the form and the schema accept", () => {
    const data = coerceExtractedAccommodation(
      {
        name: "  Ti Club  ",
        description: null,
        location: "Ljubljana, Slovenia",
        pricePerNight: "€120.00",
        totalPrice: "720",
        bedrooms: "2",
        bathrooms: 1.5,
        freeParking: "yes",
        camperParking: "no",
        amenities: ["WiFi", "wifi", "  Pool  ", ""],
        imageUrl: "/img/hotel.jpg",
      },
      "https://www.booking.com/hotel/si/ti-club.html"
    );
    expect(data).toEqual({
      name: "Ti Club",
      location: "Ljubljana, Slovenia",
      pricePerNight: "120",
      totalPrice: "720",
      bedrooms: 2,
      bathrooms: 2,
      freeParking: true,
      camperParking: false,
      amenities: ["WiFi", "Pool"],
      imageUrl: "https://www.booking.com/img/hotel.jpg",
    });
  });

  it("keeps a name inside the column limit", () => {
    const data = coerceExtractedAccommodation({ name: "x".repeat(400) });
    expect(data.name).toHaveLength(255);
  });

  it("drops nulls, placeholders and unusable images", () => {
    expect(
      coerceExtractedAccommodation({
        name: null,
        location: "unknown",
        imageUrl: "data:image/png;base64,AAAA",
        amenities: [],
      })
    ).toEqual({});
  });

  it("returns nothing for a non-object", () => {
    expect(coerceExtractedAccommodation("[]")).toEqual({});
  });
});
