/**
 * The paywall's renewal disclosure is a store requirement, so its wording is
 * tested rather than eyeballed: Apple 3.1.2 and Play both reject a purchase
 * screen that does not state how long the subscription lasts, and the failure
 * mode that matters is a yearly product described as monthly.
 */
import { describe, expect, it } from "vitest";

import { periodWording } from "./subscriptionTerms";

describe("periodWording", () => {
  it("names the common periods", () => {
    expect(periodWording("P1M")).toBe("a month");
    expect(periodWording("P1Y")).toBe("a year");
    expect(periodWording("P1W")).toBe("a week");
    expect(periodWording("P7D")).toBe("7 days");
    expect(periodWording("P3M")).toBe("3 months");
  });

  it("says nothing rather than guessing", () => {
    // The caller falls back to "each period". Inventing a length on a paywall
    // is the rejection this exists to avoid.
    expect(periodWording(null)).toBeNull();
    expect(periodWording(undefined)).toBeNull();
    expect(periodWording("")).toBeNull();
    expect(periodWording("P1M2D")).toBeNull();
    expect(periodWording("monthly")).toBeNull();
  });
});
