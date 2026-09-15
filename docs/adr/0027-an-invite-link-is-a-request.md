# 0027. An invite link is a request, not an entry

- Status: Accepted
- Date: 2026-09-15

## Context

A trip had two doors, and both stood open.

**The shared link.** `trips.inviteCode` is a `nanoid(12)` in a URL any admin can
copy off the members screen. Following it called `trips.join`, which wrote an
`accepted` membership with the role `tripmate` — a vote on every proposal, a
head in every per-person figure, and sight of every member's email, budget
ceiling and stated requirements. The link is pasted into group chats, forwarded,
and left in the history of shared laptops; none of that was distinguishable from
the admin handing it to the person they meant to invite. The trip found out
afterwards, in a notification.

**The emailed invitation.** `trips.sendInviteEmail` writes a row carrying an
address, a role and a token, and mails a link containing the token. `join`
looked the token up, checked only that it was not `revoked`, and granted the
role it named. Two things followed from that, both wrong:

- The invitation was never bound to the address it was sent to. Forwarding the
  mail handed the seat — including an `admin` seat — to whoever opened it.
- It was never spent. It was marked `accepted`, but nothing read that back, so
  the same link kept working: for the next person it was forwarded to, and for
  the same person after they had already declined it.

The trip's own defences do not cover any of this. `requireTripRole` asks what
role a member has, not how they came to have one; the role model assumes
membership was granted deliberately.

## Decision

**Membership is granted by a person on the trip, not by possession of a URL.**

- A **shared link** creates a `pending` membership — a request. It counts
  nowhere: not in `getTripVoterCount`, not in the headcount, not in the trips
  list, and `requireTripRole` refuses every trip procedure until it is
  answered. The trip's admins are notified, and answer it on the members screen
  (`trips.respondToJoinRequest`), choosing the seat as they do.
- An **emailed invitation** still joins outright, because the trip addressed a
  specific person and named their role — but only when the signed-in account's
  address matches the one it was sent to, and only while its status is still
  `pending`. Spent or withdrawn invitations are refused with a message saying
  so. An invitation opened by anyone else is not honoured and stays open for
  its addressee; that person lands in the ordinary request queue instead, which
  is also the way out for somebody whose account uses a different address from
  the one they were invited at.
- **Declining is bound the same way**, and to a pending invitation only.
  Otherwise a forwarded link lets a stranger decline on the invitee's behalf,
  which is a quiet way to keep somebody off a trip.
- `trips.getByInviteCode` — public, because the join screen answers before you
  sign in — returns the trip's name and description instead of its row.

Address comparison is case and whitespace only. No plus-address folding, no
dots-in-gmail cleverness: it decides who gets a seat, and a normalisation rule
that is right for one provider and wrong for the next hands out seats on a
guess.

**The seeded demo is exempt**, via `isDemoTrip` in `shared/demo.ts`: a trip
whose invite code starts `DEMO-`. The sales tour is a link a prospect follows to
land inside a trip, and there is nobody on the other side to approve them. Demo
trips hold no real data and `pnpm seed:demo` rebuilds them, which is what makes
that acceptable — and why the exemption keys on the seeded prefix rather than a
flag somebody could set on a real trip.

No schema change: `member_status` already had `pending`, and `invite_status`
already had the four states. What was missing was anything reading them.

## Consequences

- **Joining by link takes two people now.** A trip whose admins are slow leaves
  people waiting, and there is no self-service way in. That is the cost of the
  decision, not a defect: the alternative is what this ADR replaces.
- The acceptance metric moved with the rule. `invite.accepted` is recorded when
  somebody actually gets in — at the join for an emailed invitation, at the
  approval for a link — so the beta's acceptance rate is not inflated by
  everybody who ever opened a forwarded URL. See
  `docs/runbooks/beta-metrics.md`.
- An invitation that has been answered cannot be re-answered. Somebody who
  declines by mistake needs a new invitation, and the members screen already
  has that button.
- `member.requested` and `member.rejected` join the activity vocabulary in
  `server/db.ts`, so the trail distinguishes asking from joining, and an admin
  turning somebody down from an invitee declining.
- The pending rows are member rows, so anything that reads `tripMembers`
  without filtering on `status` will now see people who are not on the trip.
  Everything in the app does filter — `getUserTrips`, `getTripVoterCount`,
  `getTripHeadcount` and `requireTripRole` were already written that way, which
  is what made this a small change — but a new query has to remember it.
