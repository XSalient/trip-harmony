/**
 * The per-request membership cache, and the obligation that comes with it.
 *
 * A cache in front of an authorisation lookup is the kind of optimisation that
 * is either invisible or a security incident, so the interesting cases here are
 * all the ones where it must *not* answer: outside a request, after a write, and
 * for a pair it has not been asked about.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cachedTripMember,
  forgetMemberships,
  withRequestCache,
} from "./requestCache.js";

const member = (role: string) => ({ role, status: "accepted" });

describe("cachedTripMember", () => {
  it("asks the database once for the same pair", async () => {
    const load = vi.fn().mockResolvedValue(member("admin"));
    await withRequestCache(async () => {
      expect(await cachedTripMember(7, 42, load)).toEqual(member("admin"));
      expect(await cachedTripMember(7, 42, load)).toEqual(member("admin"));
      expect(await cachedTripMember(7, 42, load)).toEqual(member("admin"));
    });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps different people, and different trips, apart", async () => {
    const load = vi.fn(async () => member("tripmate"));
    await withRequestCache(async () => {
      await cachedTripMember(7, 42, load);
      await cachedTripMember(7, 43, load);
      await cachedTripMember(8, 42, load);
    });
    // The bug this guards against is the one where everybody on a trip gets
    // the first person's role.
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("remembers that somebody is not a member", async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    await withRequestCache(async () => {
      expect(await cachedTripMember(7, 99, load)).toBeUndefined();
      expect(await cachedTripMember(7, 99, load)).toBeUndefined();
    });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache across requests", async () => {
    // A role changed between two requests must be seen by the second. Caching
    // one across them would leave a revoked member with their access.
    const load = vi.fn().mockResolvedValue(member("admin"));
    await withRequestCache(() => cachedTripMember(7, 42, load));
    await withRequestCache(() => cachedTripMember(7, 42, load));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reads straight through outside a request", async () => {
    // Scripts, seeds and tests call `db.ts` with no request around them, and
    // must not be handed anything stale.
    const load = vi.fn().mockResolvedValue(member("admin"));
    await cachedTripMember(7, 42, load);
    await cachedTripMember(7, 42, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("a write ends the caching for that request", () => {
  it("re-reads what it wrote", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(member("tripmate"))
      .mockResolvedValueOnce(member("admin"));

    await withRequestCache(async () => {
      expect(await cachedTripMember(7, 42, load)).toEqual(member("tripmate"));
      forgetMemberships();
      expect(await cachedTripMember(7, 42, load)).toEqual(member("admin"));
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("stops caching for the rest of the request, not just once", async () => {
    const load = vi.fn().mockResolvedValue(member("admin"));
    await withRequestCache(async () => {
      forgetMemberships();
      await cachedTripMember(7, 42, load);
      await cachedTripMember(7, 42, load);
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("discards a read that was in flight when the write landed", async () => {
    // The race the poisoning exists for: a batch resolves its procedures
    // concurrently, so a read that started before a write can finish after it
    // and would otherwise store the row from before.
    let release: (v: unknown) => void = () => {};
    const slow = new Promise(resolve => {
      release = resolve;
    });

    const load = vi
      .fn()
      .mockImplementationOnce(async () => {
        await slow;
        return member("tripmate");
      })
      .mockResolvedValue(member("admin"));

    await withRequestCache(async () => {
      const inFlight = cachedTripMember(7, 42, load);
      forgetMemberships();
      release(null);
      await inFlight;

      expect(await cachedTripMember(7, 42, load)).toEqual(member("admin"));
    });
  });
});

/**
 * Every `db.ts` function that writes `trip_members` has to invalidate, or a
 * procedure reads back its own pre-write membership. Asserted against the
 * source because the failure is silent: the cache is only consulted inside a
 * request, so a unit test of the writer alone would pass.
 */
describe("every writer of trip_members invalidates", () => {
  const db = readFileSync(join(import.meta.dirname, "..", "db.ts"), "utf8");

  /** Top-level exported functions, by name, with their bodies. */
  const functions = [...db.matchAll(/\nexport async function (\w+)\(/g)].map(
    (m, i, all) => {
      const start = m.index;
      const next = all[i + 1]?.index;
      return { name: m[1], body: db.slice(start, next ?? undefined) };
    }
  );

  const writers = functions.filter(f =>
    /\.(update|insert|delete)\(tripMembers\)|delete\(tripMembers\)/.test(f.body)
  );

  it("finds the writers at all", () => {
    // If this drops to zero the loop below passes vacuously, which is how a
    // guard like this quietly stops guarding.
    expect(writers.length).toBeGreaterThanOrEqual(6);
  });

  for (const { name } of writers) {
    it(`${name} calls forgetMemberships`, () => {
      const body = functions.find(f => f.name === name)!.body;
      expect(body).toContain("forgetMemberships()");
    });
  }
});
