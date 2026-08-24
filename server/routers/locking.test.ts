/**
 * Finalising: one set of dates, many places, many accommodations.
 *
 * The single-vs-many rule lives in three `db.ts` helpers, and getting it wrong
 * is silent — a `find()` over `selected` still returns a row, just the wrong
 * one. These assert the shape of the SQL each helper issues, and that the
 * watcher projection drops lock attribution.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectProposalForRole } from "./_shared.js";

const dbSource = readFileSync(join(import.meta.dirname, "..", "db.ts"), "utf8");

/** The body of a top-level exported function in `db.ts`. */
function bodyOf(name: string): string {
  const start = dbSource.indexOf(`export async function ${name}(`);
  expect(start, `${name} should exist in db.ts`).toBeGreaterThan(-1);
  const next = dbSource.indexOf("\nexport ", start + 1);
  return dbSource.slice(start, next === -1 ? undefined : next);
}

describe("dates finalise to exactly one", () => {
  const body = bodyOf("lockDateProposal");

  it("clears the trip's other selections before setting one", () => {
    expect(body).toContain("eq(dateProposals.tripId, tripId)");
    expect(body).toContain("eq(dateProposals.id, proposalId)");
    // The clear must come first, or it would immediately undo the set.
    expect(body.indexOf("tripId, tripId")).toBeLessThan(
      body.indexOf("id, proposalId")
    );
  });

  it("records who finalised it and when", () => {
    expect(body).toContain("lockedBy");
    expect(body).toContain("lockedAt: new Date()");
  });
});

describe("places and accommodations finalise to many", () => {
  for (const [name, table, idArg] of [
    ["setDestinationLock", "destinations", "destinationId"],
    ["setAccommodationLock", "accommodations", "accommodationId"],
  ] as const) {
    describe(name, () => {
      const body = bodyOf(name);

      it("touches only the row it was given", () => {
        expect(body).toContain(`eq(${table}.id, ${idArg})`);
      });

      it("never clears the whole trip — that is what made this single-lock", () => {
        expect(body).not.toContain(`eq(${table}.tripId`);
      });

      it("clears the attribution when un-finalising, rather than leaving a stale author", () => {
        expect(body).toContain("lockedBy: null");
        expect(body).toContain("lockedAt: null");
      });
    });
  }

  it("still offers a way to clear every finalised row at once", () => {
    expect(bodyOf("unlockDestinations")).toContain("eq(destinations.tripId");
    expect(bodyOf("unlockAccommodations")).toContain(
      "eq(accommodations.tripId"
    );
  });
});

describe("no caller can reach the old single-lock helpers", () => {
  it("the replaced names are gone from db.ts", () => {
    for (const gone of [
      "export async function selectDestination(",
      "export async function selectAccommodation(",
      "export async function selectDateProposal(",
    ]) {
      expect(dbSource).not.toContain(gone);
    }
  });
});

describe("lock attribution is a member detail", () => {
  const locked = {
    id: 3,
    name: "Girona",
    selected: true,
    proposedBy: 42,
    lockedBy: 42,
    lockedAt: new Date("2026-08-02"),
    createdAt: new Date("2026-08-01"),
    votes: [{ id: 1, userId: 42, vote: "love" }],
  };

  it("admins and tripmates see who finalised it", () => {
    expect(projectProposalForRole(locked, "admin")).toBe(locked);
    expect(projectProposalForRole(locked, "tripmate")).toBe(locked);
  });

  it("a watcher sees that it is finalised but not by whom", () => {
    const seen: any = projectProposalForRole(locked, "watcher");
    expect(seen.selected).toBe(true);
    expect(seen).not.toHaveProperty("lockedBy");
    expect(seen).not.toHaveProperty("lockedAt");
  });
});

/**
 * A proposal everybody abstained on cannot be finalised.
 *
 * Structural on purpose. The rule is one line in four routers, and the failure
 * it prevents is silent in both directions: a missing guard locks in a decision
 * nobody made, and a guard on the un-lock path traps a proposal in that state
 * forever. Both render perfectly.
 */
describe("finalising refuses an all-abstained proposal", () => {
  const routerSource = (file: string) =>
    readFileSync(join(import.meta.dirname, file), "utf8");

  /** The body of one procedure, by the shape every router in here uses. */
  function procedure(file: string, name: string): string {
    const src = routerSource(file);
    const start = src.indexOf(`  ${name}: protectedProcedure`);
    expect(start, `${name} should exist in ${file}`).toBeGreaterThan(-1);
    const next = src.indexOf("\n  }),", start);
    return src.slice(start, next === -1 ? undefined : next);
  }

  for (const [file, name, setter] of [
    ["dates.ts", "lock", "db.lockDateProposal("],
    ["destinations.ts", "setLock", "db.setDestinationLock("],
    ["accommodations.ts", "setLock", "db.setAccommodationLock("],
    ["budget.ts", "setLock", "db.setBudgetLock("],
  ] as const) {
    describe(`${file} ${name}`, () => {
      const body = procedure(file, name);

      it("asks the guard before it writes", () => {
        expect(body).toContain("assertFinalisable(");
        expect(body.indexOf("assertFinalisable(")).toBeLessThan(
          body.indexOf(setter)
        );
      });

      it("is still admin-only", () => {
        expect(body).toContain('"admin"');
      });
    });
  }

  // `dates.lock` only ever locks, so it needs no condition; the three toggles
  // must not refuse an un-finalise.
  for (const [file, name] of [
    ["destinations.ts", "setLock"],
    ["accommodations.ts", "setLock"],
    ["budget.ts", "setLock"],
  ] as const) {
    it(`${file} ${name} guards the lock only, never the un-lock`, () => {
      const body = procedure(file, name);
      const guard = body.indexOf("assertFinalisable(");
      expect(body.slice(0, guard)).toContain("if (input.locked)");
    });
  }
});

describe("every vote input accepts going with the majority", () => {
  for (const [file, expected] of [
    ["dates.ts", "DATE_VOTES"],
    ["destinations.ts", "PREFERENCE_VOTES"],
    ["accommodations.ts", "PREFERENCE_VOTES"],
    ["budget.ts", "PREFERENCE_VOTES"],
  ] as const) {
    it(`${file} takes its values from shared/votes.ts`, () => {
      const src = readFileSync(join(import.meta.dirname, file), "utf8");
      expect(src).toContain(`vote: z.enum(${expected})`);
      // A literal list here is how the fourth value gets forgotten.
      expect(src).not.toContain('z.enum(["love", "fine", "veto"])');
      expect(src).not.toContain(
        'z.enum(["available", "maybe", "unavailable"])'
      );
    });
  }
});
