# 0028. The shared invite link is off by default, and spends itself

- Status: Accepted
- Date: 2026-09-15
- Amends: [ADR-0027](0027-an-invite-link-is-a-request.md)

## Context

[ADR-0027](0027-an-invite-link-is-a-request.md) closed the two open doors into
a trip. Its answer for the shared link was an approval queue: following the
link created a `pending` membership and a trip admin admitted the person on the
members screen.

That is safe and it is also a tax. Every arrival costs an admin a decision,
including the ones they were expecting — the six friends they sent the link to
this morning. The thing an admin actually wants to say is not "let me vet each
of these" but **"this link is good for six people, until Friday"**: a bound,
set once, that then holds without them.

The queue also answered a question nobody had asked twice. An admin who shares
a link has already decided who they are sharing it with; what they lacked was
any way to stop that link outliving the moment — being forwarded next month, or
found in a browser on a shared laptop a year later.

## Decision

**An invite link is a bounded credential the admin issues, not a request queue
and not an open door.** Three facts on the trip, set together on the members
screen:

- `inviteLinkEnabled` — **false for every trip**, including all those that
  existed when the column arrived. A switch that defaulted to the behaviour it
  replaced would be no change at all.
- `inviteUsesLeft` — how many more people the link may admit, counting **down**.
  Enabling the link requires a number; there is no unlimited setting. At zero
  the link stops until an admin sets a new one.
- `inviteLinkExpiresAt` — optional, and it stops the link regardless of uses
  left. A count alone does not protect against a link that leaks in six months
  with two uses still on it.

Within those bounds a link join is immediate again: the person becomes a
tripmate, exactly as before ADR-0027, with no admin in the loop.

**The uses are the link's, not the trip's seats.** Somebody who joins by link
and then leaves does not give a use back. A use is an act, and it happened.
This was chosen deliberately over a live count of link joiners: a countdown has
nothing to drift, needs no reconciliation when a member is removed, and "three
left" means the same thing on the card tomorrow as it does today.

**Spending it is the gate.** `spendInviteLinkUse` is a single conditional
`UPDATE` — switch on, not expired, count above zero — that returns the
remainder or nothing. Read-then-decide-then-write would let two people tapping
at the same moment both take the last use, and a bound that can be exceeded is
not a bound. No row updated means no use was available, and the caller is
refused without ever learning which of the three conditions failed.

**What ADR-0027 decided about emailed invitations stands unchanged**: bound to
the address they were sent to, spent when answered, refused afterwards. They
are a different door and this switch does not touch them — an admin who turns
the link off has not stopped inviting people, only stopped the link.

**A forwarded invitation still becomes a request.** That is the one path left
into the approval queue ADR-0027 built, and the queue stays for it: the invite
named somebody else, so it cannot be honoured, but the person holding it may
well be somebody the trip wants. They wait for an admin, and they do not spend
one of the link's uses — they did not use the link.

**Anybody on the trip may leave it** (`trips.leave`), watchers included, which
is the other half of a trip you can join without being asked about: the last
admin cannot, for the same reason they cannot be removed. Leaving takes the
member row and the attendee row and leaves the proposals, votes and comments
where they are.

The seeded demo trips remain exempt from the whole mechanism (`isDemoTrip`),
as ADR-0027 records: a sales tour has nobody on the other side.

## Consequences

- **Migration 0022 closes every existing trip's link.** An admin who was
  relying on one finds it off, with an explanation and a two-field form. That
  is the intended blast radius — the column could not default the other way —
  but it is a real interruption for trips mid-invite, and nothing warns them in
  advance.
- **An admin can lock themselves out of their own link** by setting a small
  number and forgetting. The remedy is the same form, which is why the count is
  "how many more", not a total to do arithmetic against.
- **A link with uses left is still a bearer token.** It can be forwarded and
  the forwarder's friend can take a seat — bounded, dated, but unvetted. Trips
  that want every arrival checked should leave the link off and invite by
  email; the queue only guards forwarded invitations now.
- The acceptance metric is back to what it was before ADR-0027 for the link
  half: `invite.accepted` with `via: "link"` fires at the join, not at an
  approval. `docs/runbooks/beta-metrics.md` says so.
- The approval queue is now rare — one path reaches it. It is kept because the
  case it serves is real, but a screen that fills once a quarter is a screen
  nobody recognises when it does; the members page therefore only draws it when
  somebody is in it.
