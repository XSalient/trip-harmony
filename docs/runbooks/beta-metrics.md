# Beta metrics

Four questions, and the SQL that answers them. Everything here reads one table,
`product_events`, written server-side by `recordProductEvent`. There is no
analytics vendor and nothing to log into — connect to the database
([database.md](database.md)) and run these.

Why it is built this way, and why it is not the activity trail:
[ADR 0024](../adr/0024-first-party-product-measurement.md).

## What is in the table

| Column        | Notes                                                            |
| ------------- | ---------------------------------------------------------------- |
| `event`       | One of `PRODUCT_EVENTS` in `shared/productEvents.ts`             |
| `occurredAt`  | UTC, and also when the row was written                           |
| `tripId`      | Null when the event is not about one trip. **Not a foreign key** |
| `actorUserId` | Null when the actor is not the point. **Not a foreign key**      |
| `metadata`    | JSON text: enums, booleans and counts only — never free text     |

The eleven events:

```
trip.created             cloned: bool
invite.sent              role
invite.accepted          role, via: link | email
preference.saved         sections: 0–4
proposal.created         kind: date | destination | accommodation | budget
vote.recorded            kind, changed: bool
referee.run              phase
dates.finalised          —
accommodation.finalised  —
trip.completed           —
trip.cancelled           —
```

**Read these three things before trusting a number:**

1. **Rows outlive their trips and their users.** A deleted trip keeps its
   events, on purpose — otherwise the trips that went badly vanish from every
   rate. So never `JOIN trips` or `JOIN users` here: it silently drops them
   again. The queries below never do.
2. **Only deliberate acts are recorded.** Proposing something casts an implicit
   vote in the app; that is recorded as `proposal.created` and not also as a
   vote, so participation counts things people chose to do.
3. **Everything is post-authorisation.** An event exists because the mutation
   succeeded, after its role check. A watcher who tried to vote is not in here.

Every query below uses a 30-day window, spelled out as
`now() - interval '30 days'`. Change the interval in place for a different one;
it is repeated rather than parameterised so each query can be pasted alone.

---

## 1. Invite acceptance

**Do people who are invited actually join?**

```sql
SELECT
  count(*) FILTER (WHERE event = 'invite.sent')                       AS sent,
  count(*) FILTER (WHERE event = 'invite.accepted'
                     AND metadata::jsonb->>'via' = 'email')           AS accepted_by_invite,
  count(*) FILTER (WHERE event = 'invite.accepted'
                     AND metadata::jsonb->>'via' = 'link')            AS joined_by_link,
  round(
    100.0 * count(*) FILTER (WHERE event = 'invite.accepted'
                               AND metadata::jsonb->>'via' = 'email')
    / nullif(count(*) FILTER (WHERE event = 'invite.sent'), 0)
  , 1) AS acceptance_pct
FROM product_events
WHERE "occurredAt" > now() - interval '30 days';
```

Three things make this an estimate, all of them one-directional:

- **`via` matters.** Only the `email` half has a matching `invite.sent`.
  Somebody who followed a shared link was never invited by address, so counting
  them in the numerator would produce rates above 100%.
- **Re-sending an invite records a second `invite.sent`.** The app updates the
  existing invite row rather than adding one, but the event fires per attempt
  and the address is deliberately not stored, so re-sends cannot be collapsed.
  The rate is therefore a **lower bound**.
- **Acceptance lags the send.** Somebody invited on day 29 of a 30-day window
  has had a day to answer. For a settled figure, end the window a week short of
  today.

For the exact current figure — no estimate, no lag — the `trip_invites` table
is authoritative and is not telemetry:

```sql
SELECT status, count(*) FROM trip_invites GROUP BY status;
```

Use that for "where do we stand", and the event query for "is it changing".

## 2. Active participation

**Of the people on a trip, how many do anything?**

Participation means a deliberate contribution: a proposal, a vote, saved
preferences, or a logged expense.

```sql
WITH arrived AS (            -- everyone who reached a trip, however they got there
  SELECT DISTINCT "tripId", "actorUserId"
  FROM product_events
  WHERE event IN ('trip.created', 'invite.accepted')
    AND "tripId" IS NOT NULL AND "actorUserId" IS NOT NULL
),
did_something AS (
  SELECT DISTINCT "tripId", "actorUserId"
  FROM product_events
  WHERE event IN ('proposal.created', 'vote.recorded', 'preference.saved')
    AND "occurredAt" > now() - interval '30 days'
)
SELECT
  count(*)                                          AS people_on_trips,
  count(*) FILTER (WHERE d."tripId" IS NOT NULL)    AS participated,
  round(100.0 * count(*) FILTER (WHERE d."tripId" IS NOT NULL)
        / nullif(count(*), 0), 1)                   AS participation_pct
FROM arrived a
LEFT JOIN did_something d USING ("tripId", "actorUserId");
```

Per trip, which is the shape worth looking at — an average hides the trips
where one person did everything:

```sql
SELECT
  "tripId",
  count(DISTINCT "actorUserId") FILTER (
    WHERE event IN ('proposal.created', 'vote.recorded', 'preference.saved')
  ) AS contributors,
  count(*) FILTER (WHERE event = 'vote.recorded'
                     AND (metadata::jsonb->>'changed')::boolean) AS votes_changed
FROM product_events
WHERE "tripId" IS NOT NULL
GROUP BY "tripId"
ORDER BY contributors DESC;
```

Note that `arrived` has no window on it deliberately: somebody who joined two
months ago and voted this week is a participant, not a miss. Move the window
onto `arrived` too if the question is about newly joined people specifically.

## 3. Referee use

**Does anyone press the AI Referee, and do they press it again?**

```sql
SELECT
  count(*)                                   AS runs,
  count(DISTINCT "tripId")                   AS trips_that_used_it,
  count(DISTINCT "actorUserId")              AS people_who_used_it,
  round(count(*)::numeric
        / nullif(count(DISTINCT "tripId"), 0), 2) AS runs_per_trip
FROM product_events
WHERE event = 'referee.run'
  AND "occurredAt" > now() - interval '30 days';
```

As a share of trips, which is the number that says whether the feature has
landed:

```sql
SELECT
  count(DISTINCT "tripId") FILTER (WHERE event = 'trip.created')  AS trips,
  count(DISTINCT "tripId") FILTER (WHERE event = 'referee.run')   AS used_referee
FROM product_events
WHERE "occurredAt" > now() - interval '30 days';
```

Two caveats:

- **A run is counted when it reaches the model, not when it answers.** A run
  the model then fails is in this figure. That is right for "did they ask" and
  wrong for "did it work" — for the second, read the logs for
  `referee analysis failed`.
- **A press inside the ten-minute cooldown is not a run.** It returns the
  previous answer without a model call, and records nothing. So this counts
  distinct attempts to get a _fresh_ opinion, which is the useful reading.

`phase` says where in a trip people reach for it:

```sql
SELECT metadata::jsonb->>'phase' AS phase, count(*)
FROM product_events WHERE event = 'referee.run' GROUP BY 1 ORDER BY 2 DESC;
```

## 4. Decision completion

**Do groups actually decide anything?**

The funnel, per cohort of trips created in the window:

```sql
WITH cohort AS (
  SELECT DISTINCT "tripId"
  FROM product_events
  WHERE event = 'trip.created'
    AND "occurredAt" > now() - interval '30 days'
    AND "tripId" IS NOT NULL
),
reached AS (
  SELECT c."tripId",
    bool_or(e.event = 'proposal.created')        AS proposed,
    bool_or(e.event = 'vote.recorded')           AS voted,
    bool_or(e.event = 'dates.finalised')         AS dates_done,
    bool_or(e.event = 'accommodation.finalised') AS stay_done,
    bool_or(e.event = 'trip.completed')          AS completed,
    bool_or(e.event = 'trip.cancelled')          AS cancelled
  FROM cohort c
  LEFT JOIN product_events e USING ("tripId")
  GROUP BY c."tripId"
)
SELECT
  count(*)                                  AS trips_created,
  count(*) FILTER (WHERE proposed)          AS got_a_proposal,
  count(*) FILTER (WHERE voted)             AS got_a_vote,
  count(*) FILTER (WHERE dates_done)        AS finalised_dates,
  count(*) FILTER (WHERE stay_done)         AS finalised_a_stay,
  count(*) FILTER (WHERE completed)         AS marked_complete,
  count(*) FILTER (WHERE cancelled)         AS marked_cancelled
FROM reached;
```

Read it as a funnel: the step where the count falls off is the step the product
is failing at. "Finalised dates" is the one worth watching — it is the first
decision a group has to actually agree on.

Time to a first decision:

```sql
SELECT percentile_cont(0.5) WITHIN GROUP (
         ORDER BY extract(epoch FROM (f.at - c.at)) / 3600
       ) AS median_hours_to_dates_finalised
FROM (SELECT "tripId", min("occurredAt") at FROM product_events
      WHERE event = 'trip.created' GROUP BY 1) c
JOIN (SELECT "tripId", min("occurredAt") at FROM product_events
      WHERE event = 'dates.finalised' GROUP BY 1) f USING ("tripId");
```

Caveats:

- **`trip.completed` is an admin marking it so**, not the trip having happened.
  It is a weaker signal than the finalise events, which correspond to a real
  decision in the app. Treat the finalise steps as the measure and completion
  as a bonus.
- **The app has no "archived".** `trip.cancelled` is the nearest state it has
  and is recorded as itself, so it is never mistaken for a completion.
- **Un-finalising is not recorded.** A group that finalises dates, changes its
  mind and finalises again counts once at each finalise, and never counts
  backwards. Good for "did they ever decide", useless for "is it decided now" —
  for that, read `date_proposals.selected`.

---

## Housekeeping

**Adding an event.** Add it to `PRODUCT_EVENTS` and give it a field spec in
`PRODUCT_EVENT_FIELDS` (`shared/productEvents.ts`), call `recordProductEvent`
from the router _after_ its role check and after the write succeeds, and add
the case to `server/routers/productMeasurement.test.ts`. Metadata that the
contract does not describe is dropped and logged, not stored — so a field that
never appears in the table is a call site disagreeing with the contract.

**What must never go in.** Names, email addresses, preference or comment text,
anything a model wrote, and any amount of money. There is no string field for
them by design; do not add one.

**Retention.** There is none yet, and no per-user erase path. Both have to
exist before this is anything more than a beta — see ADR 0024.

**Sanity check that recording is alive:**

```sql
SELECT event, count(*), max("occurredAt")
FROM product_events GROUP BY event ORDER BY 3 DESC;
```
