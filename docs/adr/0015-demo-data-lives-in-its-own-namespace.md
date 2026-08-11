# 0015. Demo data lives in its own namespace

- Status: Accepted
- Date: 2026-08-11

## Context

Marketing needs the app populated: screenshots, a screencast, a link someone
can click during a call. An empty app demonstrates nothing, and the screens
that make this product worth explaining — the vote tallies, the AI match
scores, the referee naming a conflict — only exist once a group has argued in
it. Filling that in by hand takes an afternoon, cannot be repeated identically,
and rots the moment someone clicks something during a demo.

So: a seeder. Which means a script whose first act is a `DELETE`.

That is the part that needed deciding. `DATABASE_URL` is whatever the shell
last exported, and this project has three places it can point:
`postgresql://…@127.0.0.1`, the Doppler `dev` config, and the Doppler `prd`
config that `pnpm db:status:doppler` already reaches. Nothing in
`pnpm seed:demo` says which one it got. The failure mode is not subtle — it is
a wiped production trip belonging to people who are using the app.

Two shapes were available. Give the seeder its own database and forbid it
everywhere else, which is safe and useless: the point is to demo the deployed
app at a URL someone can visit. Or let it write anywhere and make it incapable
of touching data it did not create.

## Decision

**Seeded rows carry a namespace, and the seeder may only delete inside it.**

- Every demo user's `openId` starts `demo:`.
- Every demo trip's `inviteCode` starts `DEMO-`. `inviteCode` is already unique
  and indexed, which makes it the cheapest honest answer to "is this row ours?".
- Every demo mailbox is at `demo.backtotravelling.example` — a domain RFC 2606
  reserves, so a seeded account can never receive mail or be mistaken for a
  person.
- The reset selects on those two prefixes and nothing else. Trips go through
  `deleteTripCascade`, the same function the app's own delete-trip path uses,
  rather than a second hand-maintained list of child tables.

**And the target has to earn the write.** `decideRun` in
`scripts/demo/options.ts` is the single gate: a database that is not on this
machine needs `--allow-remote`, `APP_ENV=production` needs `--allow-production`
on top, and a production run may not use the default password — which is
published in the source and in the runbook, and therefore must never guard
anything reachable from the internet.

Seeding is idempotent: it removes what a previous run created before it writes.
Running it twice leaves one copy of the demo, not two.

## Consequences

**What this buys.** The demo can be seeded into a preview deployment that also
has real accounts in it, and removed again, without a conversation about
whether anything else went with it. Re-running it during a demo is free, so a
presenter can reset between takes. The safety policy is pure and unit-tested
(`scripts/demo/options.test.ts`), so the interesting half — the refusals — is
covered without a database.

**What it costs.** The namespace is a convention, not a constraint the database
enforces; a future seeder that forgets the prefix would write rows the reset
cannot find, and they would sit there looking real. The check is that all
writes go through one fixture file and one runner.

`activity_events` is derived from the fixture rather than listed in it, so the
trail cannot disagree with the data it describes — but it also means the demo
generates a couple of hundred rows in the schema's fastest-growing and
retention-free table. At demo scale that is noise; it is worth remembering if
the seeder is ever pointed at something repeatedly.

**What becomes harder.** The demo copy now lives in `scripts/demo/story.ts` and
is real work to maintain. When a screen changes shape, the fixture is another
place the change has to land — and a demo that has gone stale is worse than no
demo, because it is what a prospect sees. `pnpm verify` will not catch it;
someone has to look.
