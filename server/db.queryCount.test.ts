/**
 * The read paths that must not go back to the database once per row.
 *
 * `getTripMembers` did, twice per member, and it is reached five or six times
 * over a single page load — `getTripHeadcount` and `getTripVoterCount` both
 * call it, and four procedures call it directly. A ten-person trip came to
 * roughly 126 round trips for one screen, and `POOL_MAX` in `db.ts` caps this
 * process at three connections on purpose (ADR 0012), so they queued three at a
 * time. That is what made opening a trip, navigating between its tabs, and
 * moving somebody between families all feel slow at once.
 *
 * Structural, like `groups.test.ts`: there is no database in this suite, so the
 * guarantee is asserted against the source. The check is deliberately about
 * *shape* rather than a count — an `await` inside a loop is the shape, and it
 * is the one that gets reintroduced by accident when somebody needs one more
 * field.
 *
 * Write paths are not covered here. Some of them genuinely do fan out one
 * insert per member (the notification loops in the routers); that is a real
 * cost but a different one, on a path nobody is watching a spinner for.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const db = readFileSync(join(import.meta.dirname, "db.ts"), "utf8");

/** The body of a top-level exported function in `db.ts`. */
function dbFunction(name: string): string {
  const start = db.indexOf(`export async function ${name}(`);
  expect(start, `${name} should exist in db.ts`).toBeGreaterThan(-1);
  const next = db.indexOf("\nexport ", start + 1);
  return db.slice(start, next === -1 ? undefined : next);
}

/**
 * Does this function `await` anything inside a loop?
 *
 * Brace-matched rather than regex-matched, so the search stops at the end of
 * the loop instead of running on into the rest of the function and reporting
 * every sequential await after it.
 */
function awaitsInsideALoop(body: string): boolean {
  for (const keyword of ["for (", "for(", "while (", "while("]) {
    let from = 0;
    for (;;) {
      const at = body.indexOf(keyword, from);
      if (at === -1) break;
      from = at + keyword.length;

      const open = body.indexOf("{", at);
      if (open === -1) continue;
      let depth = 0;
      let close = open;
      for (; close < body.length; close++) {
        if (body[close] === "{") depth++;
        else if (body[close] === "}" && --depth === 0) break;
      }
      if (body.slice(open, close).includes("await ")) return true;
    }
  }
  return false;
}

/** The read paths a person is waiting on, and what each one costs a page. */
const hotReads: Array<[name: string, why: string]> = [
  ["getTripMembers", "reached five or six times over one trip page load"],
  ["getUserTrips", "the first screen after signing in"],
  ["getComments", "one thread, once per comment"],
  ["getTripHeadcount", "every group card's caption"],
  ["getTripVoterCount", "the denominator on every proposal screen"],
];

describe("hot read paths do not query once per row", () => {
  for (const [name, why] of hotReads) {
    it(`${name} — ${why}`, () => {
      expect(awaitsInsideALoop(dbFunction(name))).toBe(false);
    });
  }
});

describe("the rewritten paths collect their ids and ask once", () => {
  it("getTripMembers resolves members and inviters in a single lookup", () => {
    const body = dbFunction("getTripMembers");
    expect(body).toContain("inArray(users.id, ids)");
    // Both roles a user id plays on the row, or the inviter's name goes back
    // to being a query of its own.
    expect(body).toContain("m.invitedBy");
    expect(body).toContain("invitedByName");
  });

  it("getUserTrips fetches every trip in one query", () => {
    expect(dbFunction("getUserTrips")).toContain("inArray(trips.id, tripIds)");
  });

  it("getComments reuses the shared byline lookup", () => {
    expect(dbFunction("getComments")).toContain("namesByUserId");
  });
});

describe("awaitsInsideALoop", () => {
  // The guard above is only worth as much as this is.
  it("sees an await inside a loop", () => {
    expect(awaitsInsideALoop("for (const x of xs) { await f(x); }")).toBe(true);
  });

  it("does not see one that merely follows a loop", () => {
    expect(awaitsInsideALoop("for (const x of xs) { g(x); }\nawait f();")).toBe(
      false
    );
  });

  it("stops at the end of the loop, nested braces and all", () => {
    expect(
      awaitsInsideALoop("for (const x of xs) { if (x) { g(x); } }\nawait f();")
    ).toBe(false);
  });
});
