/**
 * The list must not offer a trip the trip page will refuse.
 *
 * `getUserTrips` selected every membership row regardless of status, while
 * `requireTripRole` — which `trips.get` runs first — rejects anything that is
 * not `accepted`. A declined membership therefore showed up as a tappable card
 * that could only ever land on "Trip not found", which reads as a trip page
 * that sometimes does not open. The demo seeds exactly such a row.
 *
 * Asserted against the source because the rule is a `where` clause: these tests
 * run with no database, so the query cannot be executed to observe it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relative: string) =>
  readFileSync(join(import.meta.dirname, relative), "utf8");

describe("getUserTrips", () => {
  const fn = readSource("../db.ts").slice(
    readSource("../db.ts").indexOf("export async function getUserTrips"),
    readSource("../db.ts").indexOf("export async function addTripMember")
  );

  it("counts only memberships the person actually accepted", () => {
    expect(fn).toContain('eq(tripMembers.status, "accepted")');
  });

  it("still selects by user, so the filter narrows rather than replaces", () => {
    expect(fn).toContain("eq(tripMembers.userId, userId)");
  });
});

describe("requireTripRole", () => {
  const src = readSource("_shared.ts");

  /**
   * The other half of the pair. If this ever softens, the filter above is
   * merely redundant; if the filter goes, this turns cards into dead ends.
   */
  it("is what the list is being kept consistent with", () => {
    const fn = src.slice(src.indexOf("export async function requireTripRole"));
    expect(fn).toContain('member.status !== "accepted"');
  });
});

/**
 * The card and the trip page must agree about how far along a trip is.
 *
 * They did not: the card read `trips.phase` — a label an admin sets by hand in
 * the edit dialog, which nothing else advances — and the trip page counted the
 * decisions the group had finalised. A trip with its dates locked and nothing
 * else showed one number on the list and another when you opened it, and the
 * list was the wrong one.
 */
describe("the progress a trip card shows", () => {
  it("travels with the row, from the sections' own finalised flags", () => {
    const db = readSource("../db.ts");
    const fn = db.slice(
      db.indexOf("async function getSettledDecisions"),
      db.indexOf("\nexport ", db.indexOf("export async function getUserTrips"))
    );
    for (const table of [
      "dateProposals",
      "accommodations",
      "destinations",
      "budgetProposals",
    ]) {
      expect(fn).toContain(table + ".selected, true");
    }
    expect(fn).toContain("decisions: settled.get(t.id)");
  });

  it("is four queries for the whole list, not four per trip", () => {
    // `db.queryCount.test.ts` guards the shape in general; this is the one
    // path where a per-row fan-out would be four times as expensive, on the
    // first screen after signing in.
    const db = readSource("../db.ts");
    const fn = db.slice(
      db.indexOf("async function getSettledDecisions"),
      db.indexOf("export async function getUserTrips")
    );
    expect(fn).toContain("Promise.all");
    expect(fn).toContain("inArray(");
  });

  it("is worked out in one place, which both screens call", () => {
    const home = readSource("../../client/src/pages/Home.tsx");
    const summary = readSource(
      "../../client/src/components/trip/TripSummary.tsx"
    );
    expect(home).toContain("tripProgress(trip.decisions");
    expect(summary).toContain("tripProgress(");
    // The phase-derived figure the card used to draw.
    expect(home).not.toContain("PHASE_ORDER");
  });
});
