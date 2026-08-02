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
        └── trip_members ── trips      (many-to-many, with role and status)

trips ──── trip_invites                (email invites awaiting an answer)

trips ──┬── date_proposals      ── date_votes
        ├── destinations        ── destination_votes
        ├── accommodations      ── accommodation_votes
        │                       └── accommodation_attributes
        ├── vibe_items          ── vibe_votes
        ├── itinerary_days      ── itinerary_items
        ├── budget_items
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

| Table                  | Purpose                                                                                                                                                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                | `openId` is the stable external identity (`email:…`, `magic:…`, or OAuth). `passwordHash` is scrypt with a per-user salt and **must never leave the server** — project through `toPublicUser()`.                                                                                                |
| `magic_link_tokens`    | Single-use sign-in tokens, 15-minute expiry, deleted on consumption.                                                                                                                                                                                                                            |
| `trip_invites`         | An invitation to an email address. Separate from `trip_members` because that table's `userId` is NOT NULL and most invitees have no account yet. One live invite per address per trip, case-insensitively.                                                                                      |
| `contacts`             | A user's own address book, so a friend's email is typed once. Grants nothing: an invite is still sent and still has to be accepted.                                                                                                                                                             |
| `webauthn_credentials` | One row per enrolled passkey. Holds a **public** key, so unlike `passwordHash` there is nothing here to protect — but the rows are still projected before they reach a client. `counter` detects a cloned authenticator; `deviceType` says whether the passkey syncs across the user's devices. |
| `webauthn_challenges`  | Single-use WebAuthn challenges, 5-minute expiry, marked used on consumption. `userId` is null for sign-in, where the account is unknown until the authenticator answers. Pruned opportunistically on the next enrolment.                                                                        |

### Trips

| Table                | Purpose                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `trips`              | `inviteCode` (nanoid) is the public join handle. `phase` tracks planning progress; `status` tracks lifecycle.           |
| `trip_members`       | Join table carrying `role` (organizer/member), `status` (pending/accepted/declined) and a per-member `budgetMax`.       |
| `member_preferences` | Free-text must-haves, strong preferences, avoids and comments, stored per member per trip and parsed by the AI matcher. |

### Proposals and votes

Each proposal type follows the same pattern: a proposal table (with `proposedBy`
and an optional selected flag on the trip) and a votes table with one row per
member per proposal.

| Proposal         | Votes                 | Vote values                     |
| ---------------- | --------------------- | ------------------------------- |
| `date_proposals` | `date_votes`          | available / maybe / unavailable |
| `destinations`   | `destination_votes`   | love / fine / veto              |
| `accommodations` | `accommodation_votes` | love / fine / veto              |
| `vibe_items`     | `vibe_votes`          | love / fine / veto              |

`accommodations` also stores parsed structured details (bedrooms, bathrooms,
en-suites, amenities, prices, link) and cached AI match analysis —
`groupFitScore`, `comfortScore`, `resentmentRisk`, a summary, flags and
per-member match rows. That cache is recomputed asynchronously whenever an
accommodation or anyone's preferences change.

`accommodation_attributes` holds the open-ended attribute set extracted by the
LLM, so new requirements never need a schema change.

### Supporting

| Table                                | Purpose                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `budget_items`                       | Category, amount, split type; summarised per person.                                            |
| `itinerary_days` / `itinerary_items` | Day-by-day plan with typed items (activity/food/transport/…).                                   |
| `referee_messages`                   | AI mediation output, typed nudge/mediation/compromise/celebration/summary.                      |
| `notifications`                      | In-app feed with read state.                                                                    |
| `proposal_comments`                  | Polymorphic on `(proposal_type, proposal_id)` so one implementation serves every proposal kind. |

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
