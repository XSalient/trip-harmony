/**
 * Who may reorganise whom.
 *
 * Grouping used to be admin-only, which on a trip of families meant asking
 * somebody else to put you in your own household — and the members page hid
 * the control on your own row, so even an admin could not add themselves. It
 * is a tripmate's job now, and the danger of loosening it is the other
 * direction: one tripmate quietly reshuffling two families they are in
 * neither of, which supersedes other people's votes and shows nothing.
 *
 * `mayAssign` is where that line is drawn, so it is tested on fixtures rather
 * than through the procedure; the sweep below asserts the procedures still ask.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mayAssign } from "./groups.js";

const source = readFileSync(join(import.meta.dirname, "groups.ts"), "utf8");

/**
 * The body of one procedure — up to the next one, the same boundary
 * `roleCoverage.test.ts` uses. Matching on a closing brace instead swallows
 * the rest of the file whenever a procedure ends any other way.
 */
const starts = [...source.matchAll(/^ {2}(\w+): protectedProcedure/gm)];
function procedure(name: string): string {
  const i = starts.findIndex(m => m[1] === name);
  expect(i, `${name} should exist in groups.ts`).toBeGreaterThan(-1);
  const from = starts[i].index!;
  const to = starts[i + 1]?.index ?? source.length;
  return source.slice(from, to);
}

const admin = { role: "admin", userId: 1, groupId: null };
const patelAdult = { role: "tripmate", userId: 2, groupId: 10 };
const otherPatel = { userId: 3, groupId: 10 };
const shah = { userId: 4, groupId: 20 };
const ungrouped = { role: "tripmate", userId: 5, groupId: null };

describe("mayAssign", () => {
  it("lets an admin move anyone anywhere", () => {
    expect(mayAssign(admin, shah, 10)).toBe(true);
    expect(mayAssign(admin, shah, null)).toBe(true);
  });

  it("lets anyone move themselves — the whole point of the change", () => {
    expect(mayAssign(patelAdult, { userId: 2, groupId: 10 }, 20)).toBe(true);
    expect(mayAssign(ungrouped, { userId: 5, groupId: null }, 10)).toBe(true);
    // Including an admin, who could not do this at all before.
    expect(mayAssign(admin, { userId: 1, groupId: null }, 10)).toBe(true);
  });

  it("lets a tripmate pull someone into their own group", () => {
    expect(mayAssign(patelAdult, shah, 10)).toBe(true);
  });

  it("lets a tripmate push someone out of their own group", () => {
    expect(mayAssign(patelAdult, otherPatel, null)).toBe(true);
  });

  it("refuses a tripmate reorganising two families they are in neither of", () => {
    expect(mayAssign(patelAdult, shah, 30)).toBe(false);
  });

  it("grants an ungrouped tripmate nothing over anybody else", () => {
    // `groupId == null` matching `target.groupId == null` would let every
    // ungrouped member shuffle every other one.
    expect(mayAssign(ungrouped, { userId: 6, groupId: null }, 10)).toBe(false);
    expect(mayAssign(ungrouped, shah, null)).toBe(false);
  });
});

describe("the procedures ask the right role", () => {
  it("a tripmate may create a group, and is put in it by default", () => {
    const body = procedure("create");
    expect(body).toContain(
      'requireTripRole(input.tripId, ctx.user.id, "tripmate")'
    );
    expect(body).not.toContain('"admin"');
    expect(body).toContain("joinMe");
  });

  it("assignMember asks mayAssign and refuses with FORBIDDEN", () => {
    const body = procedure("assignMember");
    expect(body).toContain(
      'requireTripRole(input.tripId, ctx.user.id, "tripmate")'
    );
    expect(body).toContain("mayAssign(");
    expect(body).toContain("FORBIDDEN");
  });

  it("renaming a group is admin, or a tripmate in it", () => {
    expect(procedure("rename")).toContain("requireGroupAccess(");
  });

  it("removing a populated group is still an admin's call", () => {
    const body = procedure("remove");
    expect(body).toContain('me.role !== "admin"');
    expect(body).toContain("FORBIDDEN");
    // It has to look at both, or a group holding only children deletes freely.
    expect(body).toContain("getTripMembers(");
    expect(body).toContain("getTripAttendees(");
  });

  it("the voting unit stays admin-only — it changes every denominator", () => {
    expect(procedure("setVotingUnit")).toContain(
      'requireTripRole(input.tripId, ctx.user.id, "admin")'
    );
  });
});
