# 0024. First-party product measurement, in its own table

- Status: Accepted
- Date: 2026-08-15

## Context

The beta needs answers to four questions — do invited people actually join, do
the people on a trip do anything, does anyone press the AI Referee, and do
groups reach a decision — and the app currently cannot answer any of them.

Two things were already true and pulled in opposite directions.

**There is an activity trail.** `activity_events` records twenty verbs across
ten routers, written server-side, fire-and-forget, with a JSON metadata blob.
That is most of a measurement system already, and building a second one beside
it needs justifying.

**It is the wrong store to measure from**, for three reasons that only become
visible when you try:

- `deleteTripCascade` deletes a trip's activity with the trip. An abandoned
  trip that someone tidies away takes its whole funnel with it — and abandoned
  trips are exactly what a beta is trying to count. Every rate computed from
  the trail would be biased towards trips that went well.
- The trail carries member detail on purpose: `member.invited` stores the email
  address, `proposal.deleted` stores the proposal's name. It exists to be shown
  back to the group, so that is correct there. It is not a store from which a
  privacy-safe metric can be claimed.
- Its vocabulary belongs to the trip's history. `proposal.locked` on a date and
  `proposal.locked` on a stay are the same verb there and two different
  decisions here; `vote.cast` and `vote.changed` are two verbs there and one
  question here ("did they participate?").

The alternative that was not considered for long: an analytics vendor. It would
mean shipping a script that sees every screen, a second copy of the group's
data on someone else's servers, and a cookie banner — for four numbers.

## Decision

**Record product events server-side, into a `product_events` table of our own,
against a typed contract in `shared/productEvents.ts`.**

- **Eleven events**, named `<entity>.<verb>` like the activity trail so neither
  list reads as the odd one out. `PRODUCT_EVENTS` is the whole vocabulary.
- **Four columns of substance**: event name, timestamp, trip id where there is
  one, actor id where the actor is the point. `tripId` and `actorUserId` are
  plain integers and nullable — deliberately not foreign keys, because these
  rows outlive what they name.
- **Metadata is an enum, a boolean or a count. There is no string field.**
  `PRODUCT_EVENT_FIELDS` declares every field of every event, and
  `sanitiseProductEventMetadata` drops anything else. A name, an address, a
  preference, a comment or a line of model output has no shape it could take.
- **`recordProductEvent` in `server/db.ts` applies the filter**, not the eleven
  call sites. Like `recordActivity` it never throws.
- **Not swept up by `deleteTripCascade`**, which is the point of the whole
  exercise. `server/routers/tripLifecycle.test.ts` names the exemption so the
  guard that keeps that list honest still works for everything else.
- **Nothing in the API reads it.** Measurement is read by whoever runs the beta,
  with the queries in [../runbooks/beta-metrics.md](../runbooks/beta-metrics.md).
- **No client-side collection at all.** Events are written by the same
  procedures that perform the action, so a member cannot fabricate one and an
  ad blocker cannot suppress one.

## Consequences

- The four beta questions have answers, computed from rows this application
  wrote, with no third party involved and no banner to click.
- The numbers are trustworthy in the way server-side numbers are: an event
  exists because the mutation succeeded, after its role check. A refused
  action is not counted — `server/routers/productMeasurement.test.ts` asserts
  exactly that for watchers, non-members and signed-out callers.
- **`product_events` rows can name a trip that no longer exists.** That is the
  intended trade and it has a cost: the table cannot be joined back to `trips`
  or `users` and get a complete answer, so the runbook's queries never try.
- **Two event vocabularies now exist**, and a new feature worth both a history
  entry and a metric means two calls. That is the price of the split; the
  alternative was one list serving two purposes badly. Keep them separate.
- **No retention policy**, the same known gap `activity_events` has. This table
  grows more slowly — eleven events rather than twenty verbs, and none of them
  fires on a read — but a scheduled cull is unbuilt and will have to be built
  before this is anything more than a beta.
- **Deleting an account does not delete its events.** `product_events` is on
  `USER_ROWS_ANONYMISED` in `server/db.ts`, beside `activity_events`: the rows
  stay and the `actorUserId` they name is a user row the cascade has just
  emptied of everything that identified anybody. Deleting them instead would
  remove a departing member from every funnel they were ever counted in — the
  same mistake as measuring from a table that is deleted with its trip, which
  is what this ADR exists to avoid. The rows carry an enum, a boolean or a
  count and never a word of free text, so there is nothing in them left to
  identify. If a regulator ever wants the rows gone rather than orphaned, that
  is a new decision and a new migration.
- **Nothing surfaces in the product.** No dashboard, no admin screen. If one is
  ever wanted, it is a new decision: it would put member-level activity on a
  screen, which is what [E3](../product/stories/E3-activity-and-attribution.md)
  deliberately declined to do.
