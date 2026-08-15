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
