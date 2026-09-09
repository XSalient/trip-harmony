# 0025. A hidden section is a display preference, not a permission

- Status: Accepted
- Date: 2026-09-09

## Context

The trip page rendered all eight sections for every trip. Most trips want fewer:
a weekend at somebody's house has no accommodation to vote on, a day trip has no
budget to split. An empty section is not neutral — it is a card to scroll past, a
"0 proposed" line in the summary, and, because the AI Referee is told its
`dataGaps` are "not optional context", a paragraph every run explaining that
nobody has proposed a budget to a group that was never going to.

So an admin can now switch sections off per trip. The question that shape raises,
and that the next person will get wrong if it is not written down, is what "off"
means to the server.

## Decision

**Hiding is a display decision. It is not an authorisation boundary, and the
procedures behind a hidden section are unchanged.**

`trips.setHiddenSections` writes a JSON array of section keys to
`trips.hiddenSections`, behind `requireTripRole(tripId, userId, "admin")` — the
trip role on `trip_members`, not `adminProcedure`, which is the site-wide
`users.role`. `trips.get` parses it once so no screen parses the blob twice.

Everything else stays exactly as it was. `accommodations.create` still accepts a
proposal on a trip with Accommodations hidden. Two reasons:

1. Gating them means a check in every procedure of four routers, each of which
   then has two ways to refuse and two messages to keep in step. `requireTripRole`
   is the one refusal in this codebase and is swept by
   `roleCoverage.test.ts`; a second, weaker one beside it invites the reading
   that hiding protects something.
2. It would refuse the admin re-enabling the thing they just turned off, and any
   in-flight request from a client that has not yet refetched.

The client is where it shows: the trip page skips the section, `TripSummary`
drops its row, the pending-votes banner stops counting it, and the section's own
screen renders `SectionOffNotice` instead of its body. That notice exists rather
than a redirect because these URLs are in notifications and in whatever somebody
pasted into the group chat — a link that silently lands you elsewhere reads as a
broken app.

**Nothing is deleted, and the setting stores what is _off_.** Proposals and votes
in a hidden section are untouched and return unchanged. Recording the hidden set
rather than the visible one means a section added to the app later appears on
every existing trip, instead of being invisible until somebody opts each trip in.

**The referee stops seeing hidden sections at the input.** `referee.ts` empties
their proposal lists and passes the hidden set to `buildRefereeContext`, which
suppresses the gap lines that describe them and, for budget and preferences,
states plainly that the trip turned them off. Filtering the input rather than
special-casing five `dataGaps` branches keeps one rule in one place.

## Consequences

A trip page is the sections that trip actually uses, and the referee stops
reporting a deliberate choice as missing information.

Two costs, both accepted:

- A proposal finalised and _then_ hidden disappears from the referee's view. That
  is what hiding a section means, but it is surprising the first time.
- Hiding looks like access control and is not. Anyone reading `hiddenSections`
  and concluding a watcher cannot reach a hidden section's data is wrong. The
  comment on `trips.setHiddenSections` says so, and so does this file.

The section list moved from a union in `useSectionState.ts` to `shared/sections.ts`
so the server can validate the keys it stores. `parseHiddenSections` drops keys
this build does not know and reads a bad blob as "nothing hidden": showing a
section that should have been hidden costs one tap, and failing to render the
trip page costs the trip.
