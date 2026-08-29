# 0023. Preview and production share one database

- Status: Accepted
- Date: 2026-08-29

## Context

[ADR-0010](0010-migrations-apply-on-deploy.md) says a preview "commonly points
at the production database" and leaves it there, as a general caution. On this
project it is not a caution — it is the arrangement. **There is one Supabase
database, and both Vercel Preview and Vercel Production connect to it.**

The reason is the Supabase free tier: it gives one project, and a second
database means paying for one. That trade was accepted deliberately. The cost is
everything under Consequences below, and it is a real cost.

`runbooks/environments.md` said "Preview Postgres" and "Production Postgres" as
though they were two things. They never were. That line cost an afternoon on
2026-08-29: a branch adding three migrations was deployed to preview, preview
did not migrate (per ADR-0010), and every query touching `users` failed with
`column "deletedAt" does not exist` — the same class of failure ADR-0010 was
written about, arriving from the opposite direction.

It is recorded here rather than in a chat message because a decision that lives
only in somebody's memory is a decision the next person re-derives from an
outage. That applies to AI assistants with particular force: each session starts
with no memory of the last one, and the repository is the only thing it can
read.

## Decision

One database serves both environments, and the repository says so plainly.

Three rules follow from that, and they are not optional:

- **Never set `RUN_MIGRATIONS=1` on the Preview environment.** It would migrate
  production as a side effect of building any branch, on every push, with
  nobody watching. ADR-0010's opt-in exists for projects whose preview has its
  own database. This one does not.

- **Migrations are applied deliberately**, by a person, with
  `pnpm db:status` first and `pnpm db:deploy` second. Applying a branch's
  migrations is a production change and should be made as one.

- **Every migration must be backward compatible with `master`.** Because the
  one database serves production too, a branch's migration is live in
  production the moment it is applied — while production is still running the
  old code. Additive changes (new nullable columns, new tables) are safe.
  Anything destructive needs the expand/contract dance in
  [runbooks/database.md](../runbooks/database.md), and here it is mandatory
  rather than advisory.

## Consequences

- **A branch with new migrations cannot be tested on preview until they are
  applied to the shared database** — which means applying them to production.
  There is no way around this that does not involve a second database. Plan the
  migration and the branch as one piece of work, not two.

- **Seeding touches production.** `pnpm seed:demo` writes to the same database
  the live site reads. The demo's namespace prefixes
  ([ADR-0015](0015-demo-data-lives-in-its-own-namespace.md)) are what keep that
  from being dangerous, and they are load-bearing here rather than tidy.

- **A preview is not isolated.** Data created while testing a branch is real
  data on the live site. That is worth remembering before generating a hundred
  trips to test pagination.

- **The obvious fix costs money.** A second Supabase project separates them and
  makes `RUN_MIGRATIONS=1` on preview the right setting rather than a
  loaded gun. When the free tier stops being the constraint, that is the change
  to make, and this ADR should be superseded rather than edited.
