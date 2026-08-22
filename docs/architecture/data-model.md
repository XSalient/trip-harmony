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
        ├── referee_messages          (AI output)
        └── notifications

users ── webauthn_credentials        (0:n  enrolled passkeys)

proposal_comments ── (proposal_type, proposal_id)   polymorphic, all proposal kinds
magic_link_tokens                                    standalone, short-lived
webauthn_challenges                                  standalone, short-lived
```

## Tables

### Identity

| Table                                                | Purpose                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                                              | `openId` is the stable external identity (`email:…`, `magic:…`, or OAuth). `passwordHash` is scrypt with a per-user salt and **must never leave the server** — project through `toPublicUser()`.                                                                                                                                                                      |
| `magic_link_tokens`                                  | Single-use sign-in tokens, 15-minute expiry, deleted on consumption.                                                                                                                                                                                                                                                                                                  |
| `date_proposals` · `destinations` · `accommodations` | `selected` means finalised. **Dates allow exactly one per trip; suggestions and accommodations allow many** — the rule is enforced in `server/db.ts` (`lockDateProposal` clears the trip first, `setDestinationLock` and `setAccommodationLock` touch one row). `lockedBy` / `lockedAt` record who and when, and are null for anything finalised before that existed. |
| `activity_events`                                    | Everything members do to a trip. Deliberately has no feed — see the E3 story in `docs/product/`. Fastest-growing table here, with no retention policy yet.                                                                                                                                                                                                            |
| `trip_invites`                                       | An invitation to an email address. Separate from `trip_members` because that table's `userId` is NOT NULL and most invitees have no account yet. One live invite per address per trip, case-insensitively.                                                                                                                                                            |
| `contacts`                                           | A user's own address book, so a friend's email is typed once. Grants nothing: an invite is still sent and still has to be accepted.                                                                                                                                                                                                                                   |
| `webauthn_credentials`                               | One row per enrolled passkey. Holds a **public** key, so unlike `passwordHash` there is nothing here to protect — but the rows are still projected before they reach a client. `counter` detects a cloned authenticator; `deviceType` says whether the passkey syncs across the user's devices.                                                                       |
| `webauthn_challenges`                                | Single-use WebAuthn challenges, 5-minute expiry, marked used on consumption. `userId` is null for sign-in, where the account is unknown until the authenticator answers. Pruned opportunistically on the next enrolment.                                                                                                                                              |

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

| Proposal           | Votes                 | Vote values                     |
| ------------------ | --------------------- | ------------------------------- |
| `date_proposals`   | `date_votes`          | available / maybe / unavailable |
| `destinations`     | `destination_votes`   | love / fine / veto              |
| `accommodations`   | `accommodation_votes` | love / fine / veto              |
| `budget_proposals` | `budget_votes`        | love / fine / veto              |

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

| Table               | Purpose                                                                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `budget_proposals`  | A named figure with a `scope` (trip total / per person / per adult / per group) and an optional `covers` note. **Exactly one is finalised at a time** — budget follows dates, not places. The arithmetic that compares scopes lives in `shared/budget.ts`. |
| `referee_messages`  | AI mediation output, typed nudge/mediation/compromise/celebration/summary.                                                                                                                                                                                 |
| `notifications`     | In-app feed with read state.                                                                                                                                                                                                                               |
| `proposal_comments` | Polymorphic on `(proposal_type, proposal_id)` so one implementation serves every proposal kind.                                                                                                                                                            |

## Conventions

- Surrogate `serial` primary keys everywhere; no natural keys.
- Enums are Postgres enums (`pgEnum`), so invalid values are rejected by the
  database, not just by application code.
- Money is stored as `numeric`/text, never a float. Format at the edge.
- `createdAt` / `updatedAt` default to `now()`.
- Foreign keys cascade from `trips`: deleting a trip removes its proposals, votes
  and comments.

## Changing the schema

Edit `drizzle/schema.ts`, then follow [../runbooks/database.md](../runbooks/database.md).
Note the open gap recorded there: the project currently uses `drizzle-kit push`
rather than versioned migrations, so schema changes are not yet reviewable or
reversible in production.
