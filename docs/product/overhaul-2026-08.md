# Trip experience overhaul — August 2026

Sixteen requested changes, grouped into eight epics. This file is the map; the
specification lives in [stories/](stories/) and the state lives in
[progress.md](progress.md).

## Why this is one programme and not sixteen tickets

The changes are not independent. Six of them (roles, watcher visibility, who may
finalise a proposal, who may edit the trip, who may spend an AI run, who appears
in the activity trail) all resolve to the same question: **what is this member
allowed to do and see?** The app has no answer today — authorisation is a
scattering of inline `isTripOrganizer()` calls, and `trips.update` checks nothing
at all. Built one ticket at a time, each would invent its own answer.

So the permission model is built once, early, and everything else is written
against it.

## Terminology

The request introduces vocabulary that differs from the code. The product wins in
the UI; the schema is left alone unless a story says otherwise.

| Product term       | In the code                                 | Note                               |
| ------------------ | ------------------------------------------- | ---------------------------------- |
| **Admin**          | `memberRole = "organizer"`, `organizerId`   | Renamed in E2. `organizerId` stays |
| **Tripmate**       | `memberRole = "member"`                     | Renamed in E2                      |
| **Watcher**        | —                                           | New in E2                          |
| **Places**         | `destinations` table, `destinations` router | UI copy only — see E5              |
| **Accommodations** | `accommodations` table (UI said "Stays")    | UI copy only — see E5              |
| **Finalise/lock**  | `selected` boolean on proposal tables       | Semantics change in E6             |

## The epics

| Epic                                                                                  | Request items | Weight |
| ------------------------------------------------------------------------------------- | ------------- | ------ |
| [E1 — Remove Travel DNA](stories/E1-remove-travel-dna.md)                             | 1             | S      |
| [E2 — Members, roles and contacts](stories/E2-members-and-roles.md)                   | 2, 3          | XL     |
| [E3 — Activity trail and attribution](stories/E3-activity-and-attribution.md)         | 4, 5          | L      |
| [E4 — AI runs only when asked](stories/E4-ai-runs-on-request-only.md)                 | 6, 7          | S      |
| [E5 — Trip page restructure](stories/E5-trip-page-restructure.md)                     | 8, 10, 11, 14 | L      |
| [E6 — Finalising proposals](stories/E6-finalising-proposals.md)                       | 9, 16         | M      |
| [E7 — Editing and preferences summary](stories/E7-editing-and-preferences-summary.md) | 12, 13        | S      |
| [E8 — Add-proposal flow](stories/E8-add-proposal-flow.md)                             | 15            | S      |

Every one of the sixteen requested items appears in exactly one epic.

## Delivery order

1. **E1 — Remove Travel DNA.** First because it only ever subtracts. It touches
   `matchAnalysis.ts` and `referee.ts`, which E4 also edits, and `schema.ts`,
   which E2, E3 and E6 all edit. Doing it first means every later epic works on
   the smaller surface.
2. **E2 — Members, roles and contacts.** The permission model. Nothing after this
   point can be built honestly without it.
3. **E4 — AI runs only when asked.** Small, self-contained, and stops the app
   burning model calls on every form submit. Needs E2 only for "admins may spend
   a run".
4. **E6 — Finalising proposals.** Changes what `selected` means for places and
   accommodations. Ships before E5 because E5's summary card counts finalised
   things.
5. **E3 — Activity trail and attribution.** Needs E2's watcher projections (so the
   trail does not leak to watchers) and E6's lock events (so locking is recorded).
6. **E5 — Trip page restructure.** The big UI rewrite. Lands once the data it
   summarises is settled.
7. **E7 — Editing and preferences summary**, then **E8 — Add-proposal flow.**
   Smallest blast radius, safest last.

## Risk register

| Risk                                                                                                                              | Epic | Mitigation                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| Multi-lock breaks every `find(x => x.selected)` reader. The dashboard and all three detail screens treat `selected` as "the one". | E6   | Story enumerates every call site. Change the db helpers and the readers in one commit, not two           |
| Watcher rules leak if enforced in the UI. React can hide a field the API already sent.                                            | E2   | Projection at the router boundary + a test that asserts the payload, mirroring the `toPublicUser()` rule |
| `TripDashboard.tsx` is 1,995 lines before E5 and E6 both add to it                                                                | E5   | Extract `SectionCard` and the `QuickAdd*` dialogs to `client/src/components/trip/` as part of E5         |
| Dropping `travel_dna` is irreversible                                                                                             | E1   | Owner accepted. The migration is a separate file so it can be held back from a deploy if needed          |
| Role migration silently demotes people                                                                                            | E2   | Migration maps `organizer → admin`, `member → tripmate`; nobody becomes a watcher by migration           |

## Open questions

Carried in the story files too, next to the work they block.

1. **Do watchers see the AI Referee feed?** (E2) Referee messages summarise group
   tension and can name members. Blocks the watcher projection for
   `referee.messages`.
2. **Do existing trip members all become tripmates?** (E2) That is the proposed
   migration. An alternative is promoting members who have authored proposals.
3. **What does a section header say when several accommodations are locked?** (E6)
   The boolean "Decided" badge no longer fits. Proposal: "3 finalised".
4. **Is a numeric AI quota wanted?** (E4) E4 as written means "no AI call without a
   deliberate action, plus a cooldown". A hard N-runs-per-day cap is the variant.
