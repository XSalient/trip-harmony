/**
 * Things worth reading only once per HTTP request.
 *
 * Right now that is exactly one thing: a membership row. `requireTripRole`
 * calls `getTripMember` on **every** trip-scoped procedure, and the client
 * batches — a trip page fans out eight to ten procedures in a single HTTP
 * request, all asking the same `(tripId, userId)` question and all getting the
 * same answer. Behind a three-connection pool (`POOL_MAX` in `db.ts`, ADR 0012)
 * those ten identical queries queue against the ones the page actually needs.
 *
 * Scoped to the request rather than the process, via `AsyncLocalStorage`: a
 * membership is exactly as fresh as the request that read it, so a role changed
 * between two requests is seen by the second. Caching one across requests would
 * mean a revoked member kept their access until something evicted them, which
 * is a security bug wearing a performance costume.
 *
 * **The row is cached; the decision never is.** `hasTripRole` still runs on
 * every call, so what a role is *allowed* to do is re-derived each time and a
 * procedure demanding `admin` cannot be satisfied by a check that only proved
 * `tripmate`.
 *
 * No imports beyond Node's own, so `db.ts` can clear the cache on a write
 * without the two files becoming a cycle.
 */
import { AsyncLocalStorage } from "node:async_hooks";

type Memberships = {
  /** Keyed `tripId:userId`. A miss and a known non-member are different. */
  rows: Map<string, unknown>;
  /**
   * Set by the first write to `trip_members` in this request, after which
   * nothing is served or stored from the cache again.
   *
   * A batch resolves its procedures concurrently, so clearing on a write is not
   * quite enough on its own: a read that started before the write can finish
   * after it and store the row it saw, which a later read would then be handed.
   * Giving up on caching for the rest of the request closes that window
   * completely, and costs nothing — a request that writes a membership is not
   * the one doing ten identical reads.
   */
  poisoned: boolean;
};

const storage = new AsyncLocalStorage<Memberships>();

const key = (tripId: number, userId: number) => `${tripId}:${userId}`;

/**
 * Runs `fn` with a cache of its own.
 *
 * Wraps one HTTP request, batch included — which is the point, since the ten
 * identical lookups are ten *procedures* sharing one request. Outside it every
 * lookup is a miss and goes to the database, which is what makes this safe to
 * add: nothing depends on the cache being there, only on it not being wrong.
 */
export function withRequestCache<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ rows: new Map(), poisoned: false }, fn);
}

/**
 * The membership for this pair, from the cache or from `load`.
 *
 * `load` is only called on a miss, and its answer is cached whatever it is —
 * "not a member" is an answer worth not asking twice.
 */
export async function cachedTripMember<T>(
  tripId: number,
  userId: number,
  load: () => Promise<T>
): Promise<T> {
  const cache = storage.getStore();
  if (!cache || cache.poisoned) return load();

  const k = key(tripId, userId);
  if (cache.rows.has(k)) return cache.rows.get(k) as T;

  const row = await load();
  // Re-checked: a write may have landed while this query was in flight, and the
  // row now in hand is the one from before it.
  if (!cache.poisoned) cache.rows.set(k, row);
  return row;
}

/**
 * Stops this request caching memberships, and drops what it already had.
 *
 * Called by each `db.ts` function that writes `trip_members`, because a
 * procedure that changes somebody's group or role and then reads it back in the
 * same request must see what it wrote. Blunt on purpose — a write to that table
 * is rare and a request is short, so there is nothing to gain by being precise
 * and a stale membership to lose by getting it wrong.
 *
 * `requestCache.test.ts` asserts that every writer calls this, so the next one
 * added cannot quietly skip it.
 */
export function forgetMemberships() {
  const cache = storage.getStore();
  if (!cache) return;
  cache.rows.clear();
  cache.poisoned = true;
}
