/**
 * Deleting a trip, copying one, and saving someone you travelled with.
 *
 * These run without a database: `getDb()` returns null when no connection
 * string is configured, so a membership lookup finds nothing and every
 * trip-scoped procedure refuses. That is exactly the property worth asserting
 * here — the checks happen before any work, not after it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appRouter } from "./index.js";
import { TRIP_OWNED_TABLES } from "../db.js";
import type { TrpcContext } from "../_core/context.js";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(userId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function makeUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const readSource = (relative: string) =>
  readFileSync(join(import.meta.dirname, relative), "utf8");

describe("trips.delete", () => {
  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.trips.delete({ id: 1, confirmName: "Goa" })
    ).rejects.toThrow();
  });

  it("refuses a non-member before it can reach the trip", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.trips.delete({ id: 1, confirmName: "Goa" })
    ).rejects.toThrow(/not a member/i);
  });

  it("takes a typed confirmation, not just an id", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.trips.delete({ id: 1 } as never)).rejects.toThrow();
  });

  it("requires admin, and checks that before anything is removed", () => {
    const src = readSource("trips.ts");
    const procedure = src.slice(
      src.indexOf("delete: protectedProcedure"),
      src.indexOf("clone: protectedProcedure")
    );
    const beforeDeletion = procedure.slice(
      0,
      procedure.indexOf("deleteTripCascade")
    );
    expect(beforeDeletion).toContain(
      'requireTripRole(input.id, ctx.user.id, "admin")'
    );
    // And the name has to match, or an admin is one tap from ending the trip
    // for everyone else on it.
    expect(beforeDeletion).toContain("confirmName");
  });
});

describe("trips.clone", () => {
  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.trips.clone({ id: 1 })).rejects.toThrow();
  });

  it("refuses a non-member", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(caller.trips.clone({ id: 1 })).rejects.toThrow(
      /not a member/i
    );
  });

  it("gives the copy its own invite code", () => {
    // Sharing the original's code would send anyone following an old link into
    // whichever of the two trips resolved first.
    const src = readSource("trips.ts");
    const procedure = src.slice(
      src.indexOf("clone: protectedProcedure"),
      src.indexOf("join: protectedProcedure")
    );
    expect(procedure).toContain("inviteCode: nanoid(12)");
  });
});

/**
 * A clone is the same trip run again for a different group. Carrying the old
 * group's decisions over would open the copy with votes nobody in it had cast
 * and — via `selected` — a finalised stay nobody in it had seen.
 */
describe("cloneTripContents copies the plan, not the history", () => {
  const src = readSource("../db.ts");
  const fn = src.slice(
    src.indexOf("export async function cloneTripContents"),
    src.indexOf("export async function getUserTrips")
  );

  it("inserts nothing into the vote, comment or activity tables", () => {
    for (const table of [
      "dateVotes",
      "destinationVotes",
      "accommodationVotes",
      "proposalComments",
      "activityEvents",
      "budgetItems",
      "refereeMessages",
    ]) {
      expect(fn, table).not.toContain(`insert(${table})`);
    }
  });

  it("does not carry a lock or a finalised flag across", () => {
    expect(fn).not.toContain("selected:");
    expect(fn).not.toContain("lockedBy:");
    expect(fn).not.toContain("lockedAt:");
  });

  it("does not carry a match analysis scored for another group", () => {
    expect(fn).not.toContain("matchAnalysis:");
  });

  it("does it in one transaction", () => {
    expect(fn).toContain("db.transaction");
  });
});

/**
 * Nothing in the schema declares a foreign key — every `tripId` is a plain
 * integer — so a table left out of the cascade becomes rows that outlive their
 * trip and are reachable by nobody. This is the guard that keeps the list
 * honest as the schema grows.
 */
describe("deleteTripCascade covers the schema", () => {
  /**
   * The one table that names a trip and is deliberately not deleted with it.
   * Product measurement has to survive a deleted trip, or the abandoned ones —
   * the trips a beta most needs to count — drop out of every funnel and the
   * numbers flatter the product. See
   * `docs/adr/0024-first-party-product-measurement.md`.
   *
   * Adding to this set is a decision, not a convenience. Anything else that
   * names a trip still has to be in the cascade.
   */
  const OUTLIVES_ITS_TRIP = new Set(["product_events"]);

  it("names every table that holds a tripId", () => {
    const schema = readFileSync(
      join(import.meta.dirname, "..", "..", "drizzle", "schema.ts"),
      "utf8"
    );
    const withTripId = new Set<string>();
    for (const block of schema.split("export const ").slice(1)) {
      const table = block.match(/pgTable\(\s*"([a-z_]+)"/)?.[1];
      if (!table) continue;
      const body = block.slice(0, block.indexOf("});"));
      if (/\btripId:/.test(body) && !OUTLIVES_ITS_TRIP.has(table))
        withTripId.add(table);
    }
    expect(withTripId.size).toBeGreaterThan(0);
    expect([...withTripId].sort()).toEqual([...TRIP_OWNED_TABLES].sort());
  });

  it("leaves the measurement table out, and says so out loud", () => {
    // Asserted from the other side too: the exemption above is only honest if
    // the cascade really does not name it.
    for (const table of OUTLIVES_ITS_TRIP)
      expect(TRIP_OWNED_TABLES as readonly string[]).not.toContain(table);
    const src = readSource("../db.ts");
    const fn = src.slice(
      src.indexOf("export async function deleteTripCascade"),
      src.indexOf("export async function cloneTripContents")
    );
    expect(fn).not.toContain("productEvents");
  });

  it("deletes the trip row itself last", () => {
    const src = readSource("../db.ts");
    const fn = src.slice(
      src.indexOf("export async function deleteTripCascade"),
      src.indexOf("export async function cloneTripContents")
    );
    expect(fn.indexOf("delete(trips)")).toBeGreaterThan(
      fn.indexOf("delete(tripMembers)")
    );
    expect(fn).toContain("db.transaction");
  });
});

describe("contacts.addFromTrip", () => {
  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.contacts.addFromTrip({ tripId: 1, userId: 2 })
    ).rejects.toThrow();
  });

  it("refuses someone who is not on the trip", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.contacts.addFromTrip({ tripId: 1, userId: 2 })
    ).rejects.toThrow(/not a member/i);
  });

  it("takes the address from the membership, never from the caller", () => {
    // Every tripmate can call this. One that accepted an email would let any of
    // them write an arbitrary address into their book under a trusted-looking
    // "add from trip" action.
    const src = readSource("contacts.ts");
    const procedure = src.slice(
      src.indexOf("addFromTrip: protectedProcedure"),
      src.indexOf("remove: protectedProcedure")
    );
    expect(procedure).toContain("z.object({ tripId: z.number()");
    expect(procedure).not.toContain("z.string().email()");
    expect(procedure).toContain("email: user.email");
    // Tripmate, not watcher: a watcher is never shown member emails and must
    // not get one back through here.
    expect(procedure).toContain(
      'requireTripRole(input.tripId, ctx.user.id, "tripmate")'
    );
  });
});
