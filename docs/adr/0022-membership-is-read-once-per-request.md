# 0022. A membership is read once per request, and the decision is never cached

- Status: Accepted
- Date: 2026-08-25

## Context

[ADR 0005](0005-domain-split-routers.md) put `requireTripRole` in front of every
trip-scoped procedure, which replaced a scattering of inline organizer checks
and a majority of procedures that checked nothing beyond being signed in. It is
the right shape and it should stay.

It costs a `getTripMember` query each time. The client batches, so a trip page
arrives as eight or ten procedures in **one** HTTP request, every one of them
asking the same `(tripId, userId)` question and getting the same answer. With
`POOL_MAX` at 3 ([ADR 0012](0012-session-pooler-for-the-database-url.md)) those
ten identical queries queue against the ones the page actually needs. Until
migration 0015 the table had no index on that pair either, so each was a
sequential scan.

Caching in front of an authorisation check is the kind of optimisation that is
either invisible or an incident, so the boundary and the invalidation are the
whole decision.

## Decision

**A membership row is read at most once per HTTP request.**

`server/_core/requestCache.ts` holds an `AsyncLocalStorage` map, entered by an
Express middleware on `/api/trpc` — one request, batch included, one cache.
`db.getTripMember` reads through it. Outside a request every lookup is a miss
and goes to the database, so scripts, seeds and tests are unaffected and nothing
depends on the cache existing.

Three rules make it safe, and each exists because its opposite is a bug:

1. **The scope is the request, never the process.** A role changed between two
   requests must be seen by the second. A cache outliving the request would
   leave a revoked member holding their access until something evicted them.

2. **The row is cached; the decision is not.** `hasTripRole` runs on every call,
   so a procedure demanding `admin` can never be satisfied by a check that only
   proved `tripmate`. What a role _is_ stays data; what it _may do_ stays policy,
   re-derived each time.

3. **A write to `trip_members` ends the caching for that request**, rather than
   merely clearing it. Clearing alone is not enough when a batch resolves
   concurrently: a read that began before the write can finish after it and store
   the row from before, which a later read would then be handed. Reading through
   for the remainder closes that window and costs nothing, because a request that
   writes a membership is not the one doing ten identical reads.

Every `db.ts` function that writes that table calls `forgetMemberships()`, and
`server/_core/requestCache.test.ts` asserts that from the source — not
decoration: it found `updateMemberBudget`, which the change had missed.

The alternative was threading a cache through `ctx` and changing
`requireTripRole`'s signature at some forty call sites. Less magic and fully
typed, but a diff nobody can review against a mechanism that is thirty lines
with its own tests. If `AsyncLocalStorage` later proves troublesome under the
serverless runtime, that is the fallback and this ADR is what to supersede.

## Consequences

Ten membership queries per page load become one. Combined with migration 0015's
index on `trip_members (tripId, userId)`, the check in front of every procedure
stops being something a page load pays for repeatedly.

The obligation is permanent and it is on `db.ts`: **a new writer of
`trip_members` must invalidate.** The failure would be silent — a procedure
reading back its own pre-write membership — which is why the test asserts it
rather than a comment asking.

This is deliberately one cache for one thing. `getTrip` and the user row are the
obvious next candidates and are **not** included: the user row is the session,
where staleness is a security question rather than a latency one, and `getTrip`
is cheap and changes under a request more often. Adding a second entry to this
file means adding its invalidation obligation and its test in the same breath.
