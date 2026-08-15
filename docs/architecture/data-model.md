# Data model

PostgreSQL via Drizzle. The schema in `drizzle/schema.ts` is canonical — this
document explains the shape and intent; when they disagree, the code wins.

## Shape

Everything hangs off a **trip**. A trip has members; members create _proposals_
of several kinds; every proposal type has its own votes table and shares one
comments table.

```
users ──┬── trips                      (as creator; `organizerId`)
        ├── contacts                   (private address book)
        ├── contact_groups ── contact_group_members   (saved families)
        └── trip_members ── trips      (many-to-many, with role, status and group)

trips ──── trip_invites                (email invites awaiting an answer)

trips ──┬── trip_groups                (families/households; members and attendees point at one)
        └── trip_attendees             (everyone coming, app account or not)

trips ──┬── date_proposals      ── date_votes
        ├── destinations        ── destination_votes
        ├── accommodations      ── accommodation_votes
        │                       └── accommodation_attributes
        ├── budget_proposals    ── budget_votes
        ├── member_preferences        (per member, per trip)
        ├── suggestion_dismissals     (per member: suggestions turned down)
        ├── referee_messages          (AI output)
        └── notifications

users ── webauthn_credentials        (0:n  enrolled passkeys)

proposal_comments ── (proposal_type, proposal_id)   polymorphic, all proposal kinds
magic_link_tokens                                    standalone, short-lived
webauthn_challenges                                  standalone, short-lived
product_events                                       standalone; names a trip but does not hang off one
```

## Tables

### Identity

| Table                                                | Purpose                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`                                              | `openId` is the stable external identity (`email:…`, `magic:…`, or OAuth). `passwordHash` is scrypt with a per-user salt and **must never leave the server** — project through `toPublicUser()`.                                                                                                                                                                         |
| `magic_link_tokens`                                  | Single-use sign-in tokens, 15-minute expiry, deleted on consumption.                                                                                                                                                                                                                                                                                                     |
| `date_proposals` · `destinations` · `accommodations` | `selected` means finalised. **Dates allow exactly one per trip; suggestions and accommodations allow many** — the rule is enforced in `server/db.ts` (`lockDateProposal` clears the trip first, `setDestinationLock` and `setAccommodationLock` touch one row). `lockedBy` / `lockedAt` record who and when, and are null for anything finalised before that existed.    |
| `activity_events`                                    | Everything members do to a trip. Deliberately has no feed — see the E3 story in `docs/product/`. Fastest-growing table here, with no retention policy yet.                                                                                                                                                                                                               |
| `trip_invites`                                       | An invitation to an email address. Separate from `trip_members` because that table's `userId` is NOT NULL and most invitees have no account yet. One live invite per address per trip, case-insensitively. `groupId` is set when the invite came from importing a saved family — the invite is the only thing that survives until they accept, so it carries the intent. |
| `contacts`                                           | A user's own address book, so a friend's email is typed once. Grants nothing: an invite is still sent and still has to be accepted.                                                                                                                                                                                                                                      |
| `contact_groups` · `contact_group_members`           | A family saved in that book, owner-scoped and unique on `lower(name)`. A member row has an `email` **or not** — a child and a dog belong to a family too. With an address it becomes an invite on import; without one it becomes a `trip_attendees` row. Partial unique indexes make re-saving an append rather than a duplicate.                                        |
| `suggestion_dismissals`                              | A proposal suggestion somebody turned down. Accepting one needs no row — the resulting proposal's own fingerprint suppresses it. `kind` is a plain varchar, not an enum: it is an internal key and a new kind should not need an `ALTER TYPE`. See [ADR 0020](../adr/0020-preferences-suggest-proposals.md).                                                             |
| `webauthn_credentials`                               | One row per enrolled passkey. Holds a **public** key, so unlike `passwordHash` there is nothing here to protect — but the rows are still projected before they reach a client. `counter` detects a cloned authenticator; `deviceType` says whether the passkey syncs across the user's devices.                                                                          |
| `webauthn_challenges`                                | Single-use WebAuthn challenges, 5-minute expiry, marked used on consumption. `userId` is null for sign-in, where the account is unknown until the authenticator answers. Pruned opportunistically on the next enrolment.                                                                                                                                                 |

### Trips

| Table                | Purpose                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trips`              | `inviteCode` (nanoid) is the public join handle. `phase` tracks planning progress; `status` tracks lifecycle. `votingUnit` is `member` (default) or `group`.                                                  |
| `trip_members`       | Join table carrying `role`, `status` (pending/accepted/declined), an optional `groupId` and a per-member `budgetMax`.                                                                                         |
| `trip_groups`        | A family or household. A member belongs to at most one; **belonging to none is normal** and means a group of one. Carries the group's `budgetMax`, which supersedes the member's.                             |
| `trip_attendees`     | Everyone coming, with or without an account. `kind` is adult/child/pet; `age` is null for a pet and optional otherwise. `memberUserId` links the row to an account, one per trip, so headcount is one number. |
| `member_preferences` | Free-text must-haves, strong preferences, avoids and comments, stored per member per trip and parsed by the AI matcher.                                                                                       |

### Proposals and votes

Each proposal type follows the same pattern: a proposal table (with `proposedBy`
and an optional selected flag on the trip) and a votes table with one row per
member per proposal.

| Proposal           | Votes                 | Vote values                                |
| ------------------ | --------------------- | ------------------------------------------ |
| `date_proposals`   | `date_votes`          | available / maybe / unavailable / majority |
| `destinations`     | `destination_votes`   | love / fine / veto / majority              |
| `accommodations`   | `accommodation_votes` | love / fine / veto / majority              |
| `budget_proposals` | `budget_votes`        | love / fine / veto / majority              |

`majority` is **"go with the majority"** — an abstention, worth 0, counted as
having voted and shown separately from the other three. A proposal on which
every cast vote is one **cannot be finalised**; a proposal with no votes at all
still can. The weights and the rule live in `shared/votes.ts`, the one place
both sides read them from. See
[ADR 0018](../adr/0018-going-with-the-majority-is-an-abstention.md).

**One vote per group** is not a column. When `trips.votingUnit = "group"`, a
vote replaces any vote by another member of the same group on that proposal —
enforced on write by `applyGroupVoteExclusivity` in `server/db.ts`, so every
tally counts rows that are already one per group. See
[ADR 0016](../adr/0016-one-vote-per-group.md).

`destinations` is the **Suggestions** section in the UI — anything the group
proposes and votes on, not only a place. The table keeps its original name
because renaming it would cost a data migration and change no behaviour; the
two names are expected to differ.

`accommodations` also stores parsed structured details (bedrooms, bathrooms,
en-suites, amenities, prices, link) and cached AI match analysis —
`groupFitScore`, `comfortScore`, `resentmentRisk`, a summary, flags and
per-member match rows. That cache is recomputed asynchronously whenever an
accommodation or anyone's preferences change.

`accommodation_attributes` holds the open-ended attribute set extracted by the
LLM, so new requirements never need a schema change.

### Supporting

| Table               | Purpose                                                                                                                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `budget_proposals`  | A named figure with a `scope` (trip total / per person / per adult / per group) and an optional `covers` note. **Exactly one is finalised at a time** — budget follows dates, not places. The arithmetic that compares scopes lives in `shared/budget.ts`.                                                |
| `referee_messages`  | AI mediation output, typed nudge/mediation/compromise/celebration/summary.                                                                                                                                                                                                                                |
| `notifications`     | In-app feed with read state.                                                                                                                                                                                                                                                                              |
| `proposal_comments` | Polymorphic on `(proposal_type, proposal_id)` so one implementation serves every proposal kind.                                                                                                                                                                                                           |
| `product_events`    | First-party product measurement — eleven events, an enum/boolean/count metadata blob and no free-text column at all. **Not deleted with its trip**, and joined to nothing; see [ADR 0024](../adr/0024-first-party-product-measurement.md) and [../runbooks/beta-metrics.md](../runbooks/beta-metrics.md). |

## Conventions

- Surrogate `serial` primary keys everywhere; no natural keys.
- Enums are Postgres enums (`pgEnum`), so invalid values are rejected by the
  database, not just by application code.
- Money is stored as `numeric`/text, never a float. Format at the edge.
- `createdAt` / `updatedAt` default to `now()`.
- Foreign keys cascade from `trips`: deleting a trip removes its proposals, votes
  and comments. `product_events` is the deliberate exception — measurement has
  to survive a deleted trip or the abandoned ones drop out of every rate.

## Indexes

Read this before adding one — the table already has more than it looks like it
does, and a duplicate costs every write and buys nothing.

They live in three places, for reasons that are historical rather than good:

- **`drizzle/schema.ts`**, as `index()` on the table. This is where a new one
  should go. It declared none at all until `0015_hot_path_indexes.sql`, which is
  how every table from the original schema — memberships, votes, proposals,
  notifications, comments — spent its life being sequentially scanned.
- **Hand-written SQL**, in migrations `0005` and `0008`–`0013`, for the tables
  those migrations added: `trip_groups`, `trip_members (groupId)`,
  `trip_attendees`, `budget_proposals`, `budget_votes`, `activity_events`,
  `contacts`, `contact_group*`, `trip_invites`, `suggestion_dismissals`.
- **Functional and partial unique indexes** — `lower(email)` on contacts and
  invites, the partial ones on contact group members — which stay in SQL because
  drizzle cannot express them. `schema.ts` says so at each of those tables.

`scripts/lib/migrationSql.test.mjs` asserts that every index declared in
`schema.ts` appears in a committed migration, so the first two cannot drift.

Hot lookups worth knowing about: `trip_members (tripId, userId)` is the most
executed query in the app — `requireTripRole` runs it on every trip-scoped
procedure — and `(tripId)` alone needs nothing of its own, being the leading
column of that composite. It is not a _unique_ index, though it morally is: this
table has never been checked for duplicate pairs, and a unique index that fails
to build takes the deploy down. Tightening it is a migration of its own, after
that check.

## Changing the schema

Edit `drizzle/schema.ts`, add the matching migration, and follow
[../runbooks/database.md](../runbooks/database.md). Both go in the **same
commit** — a column that ships without its migration takes production down, and
it already did once (AGENTS.md rule 9).

**`pnpm db:generate` does not work in this repository, and running it will
propose something wrong.** `drizzle/meta/` stops at snapshot `0007` while the
journal runs to `0015`: migrations `0008` onwards were hand-written without
regenerating snapshots, so `drizzle-kit generate` diffs `schema.ts` against a
schema seven migrations stale and offers to recreate everything since. Write the
migration by hand, in the shape of `0014` or `0015`, and add its entry to
`drizzle/meta/_journal.json` — `scripts/db-migrate.mjs` reads the journal, not
the folder, so a file with no entry never applies.

That drift is worth fixing on its own: replaying the snapshots up to `0015`
would make the generator usable again. Until somebody does, the pair of tests in
`scripts/lib/migrationSql.test.mjs` — schema declarations against committed SQL,
and the journal against the files — is what stands in for it.
