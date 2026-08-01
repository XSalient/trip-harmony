/**
 * What the map is asked, and which answer is believed. The request itself is
 * `makeRequest`'s business; everything pinned here is pure.
 */
import { describe, expect, it } from "vitest";
import { countryFromCode, pickPlace, placeQuery } from "./placeLookup.js";

describe("placeQuery — what a blocked URL is worth asking about", () => {
  it("expands the ISO code the listing path carried", () => {
    expect(placeQuery({ slug: "Ti Club", countryCode: "si" })).toBe(
      "Ti Club, Slovenia"
    );
  });

  it("asks for the name alone when the URL named no country", () => {
    expect(placeQuery({ slug: "The Sukhothai Bangkok" })).toBe(
      "The Sukhothai Bangkok"
    );
  });

  it("asks nothing when the URL named no property", () => {
    expect(placeQuery({ countryCode: "si" })).toBeUndefined();
  });

  it("ignores a country code that is not one", () => {
    expect(countryFromCode("zz")).toBeUndefined();
    expect(countryFromCode("ho123456")).toBeUndefined();
    expect(placeQuery({ slug: "Casa Del Mar", countryCode: "zz" })).toBe(
      "Casa Del Mar"
    );
  });
});

describe("pickPlace — prominence is not the same as relevance", () => {
  it("takes the hotel over the restaurant inside it", () => {
    expect(
      pickPlace([
        {
          name: "Ti Club Bistro",
          types: ["restaurant", "food"],
          formatted_address: "Trg 1, Ljubljana",
        },
        {
          name: "Ti Club",
          types: ["lodging", "point_of_interest"],
          formatted_address: "Trg 2, 1000 Ljubljana, Slovenia",
          rating: 8.6,
          user_ratings_total: 412,
        },
      ])
    ).toEqual({
      name: "Ti Club",
      address: "Trg 2, 1000 Ljubljana, Slovenia",
      rating: 8.6,
      ratingCount: 412,
    });
  });

  it("still answers for a rental Google files under nothing", () => {
    expect(
      pickPlace([
        { name: "Dune House", formatted_address: "12 Ocean Rd, Outer Banks" },
      ])
    ).toEqual({ name: "Dune House", address: "12 Ocean Rd, Outer Banks" });
  });

  it("skips a property that has closed for good", () => {
    expect(
      pickPlace([
        {
          name: "Hotel Gone",
          types: ["lodging"],
          business_status: "CLOSED_PERMANENTLY",
        },
        { name: "Hotel Open", types: ["lodging"] },
      ])
    ).toEqual({ name: "Hotel Open" });
  });

  it("returns nothing rather than a nameless result", () => {
    expect(pickPlace([])).toBeNull();
    expect(pickPlace([{ formatted_address: "Somewhere" }])).toBeNull();
  });
});
