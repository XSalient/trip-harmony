/**
 * The budget arithmetic, tested where it lives.
 *
 * Two failures here are invisible on screen, which is why they are asserted
 * rather than trusted:
 *
 * - **A pet in a divisor.** A per-person figure that is a fifth too low renders
 *   perfectly. Nothing about the page looks wrong; the number is just false.
 * - **A trip with nobody on it.** `NaN` and `Infinity` propagate silently
 *   through `toFixed` and render the whole section as "NaN".
 */
import { describe, it, expect } from "vitest";
import {
  BUDGET_SCOPES,
  chargeableHeads,
  describeAmount,
  groupShareOf,
  perGroupOf,
  perPersonOf,
  tripTotalOf,
  type Headcount,
} from "./budget.js";

/** Two families and a solo traveller: six adults, three children, one dog. */
const trip: Headcount = { adults: 6, children: 3, pets: 1, groups: 3 };

describe("normalising a proposal to one trip total", () => {
  it("takes a trip total at face value", () => {
    expect(tripTotalOf(9000, "trip_total", trip)).toBe(9000);
  });

  it("multiplies a per-person figure by adults and children", () => {
    expect(tripTotalOf(500, "per_person", trip)).toBe(4500);
  });

  it("multiplies a per-adult figure by adults only", () => {
    expect(tripTotalOf(500, "per_adult", trip)).toBe(3000);
  });

  it("multiplies a per-family figure by the number of families", () => {
    expect(tripTotalOf(2400, "per_group", trip)).toBe(7200);
  });

  it("never counts a pet as a chargeable head", () => {
    expect(chargeableHeads(trip)).toBe(9);
    // The dog would make it ten, and every per-person figure on the screen
    // 10% too low — with nothing to show for it.
    expect(tripTotalOf(100, "per_person", trip)).toBe(900);
  });
});

describe("what one group pays", () => {
  const patels = { adults: 2, children: 2 };
  const solo = { adults: 1, children: 0 };

  it("charges a per-family figure flat, whatever the family's size", () => {
    expect(groupShareOf(2400, "per_group", trip, patels)).toBe(2400);
    expect(groupShareOf(2400, "per_group", trip, solo)).toBe(2400);
  });

  it("apportions every other scope by chargeable heads", () => {
    // 9,000 over nine heads is 1,000 each; the Patels are four of them.
    expect(groupShareOf(9000, "trip_total", trip, patels)).toBe(4000);
    expect(groupShareOf(9000, "trip_total", trip, solo)).toBe(1000);
  });

  it("adds up: every group's share is the trip total, no more and no less", () => {
    const groups = [
      { adults: 2, children: 2 },
      { adults: 3, children: 1 },
      { adults: 1, children: 0 },
    ];
    const sum = groups.reduce(
      (t, g) => t + groupShareOf(9000, "trip_total", trip, g),
      0
    );
    expect(sum).toBeCloseTo(9000, 6);
  });
});

describe("a trip with nobody on it yet", () => {
  const empty: Headcount = { adults: 0, children: 0, pets: 0, groups: 0 };

  it("returns zero from every scope rather than NaN or Infinity", () => {
    for (const scope of BUDGET_SCOPES) {
      const total = tripTotalOf(1000, scope, empty);
      expect(Number.isFinite(total)).toBe(true);
      const share = groupShareOf(1000, scope, empty, {
        adults: 0,
        children: 0,
      });
      expect(Number.isFinite(share)).toBe(true);
    }
  });

  it("divides by nobody without dividing by zero", () => {
    expect(perPersonOf(9000, empty)).toBe(0);
    expect(perGroupOf(9000, empty)).toBe(0);
  });

  it("survives an amount that is not a number", () => {
    expect(tripTotalOf(NaN, "per_person", trip)).toBe(0);
    expect(
      groupShareOf(NaN, "per_group", trip, { adults: 1, children: 0 })
    ).toBe(0);
  });
});

describe("how an amount reads on a card", () => {
  it("uses the trip's currency code, never a hardcoded symbol", () => {
    // The alert this section replaced said "$" while the trip carried EUR.
    expect(describeAmount(1400, "per_group", "EUR")).toBe(
      "EUR 1,400 per family"
    );
    expect(describeAmount(350, "per_person", "GBP")).toBe("GBP 350 per person");
  });
});
