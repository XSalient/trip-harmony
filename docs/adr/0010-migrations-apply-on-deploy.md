# 0010. Migrations apply during the deploy, not by hand afterwards

- Status: Accepted
- Date: 2026-08-02

## Context

Applying migrations was a manual step. `vercel.json` built the SPA and nothing
else; someone was expected to run `pnpm db:migrate:doppler` against production
around the time the matching code shipped.

On 2026-08-02 that step was missed. Commit `87a581f` added `updatedAt` to the
three vote tables in `drizzle/schema.ts`, wrote migration
`0005_activity_and_vote_times` to create the column, and shipped code that
selects it. The code deployed; the migration did not run. Every read of
`date_votes`, `destination_votes` and `accommodation_votes` failed with
Postgres `42703 column "updatedAt" does not exist` — 61 errors in seven minutes
across `dates.list`, `destinations.list`, `accommodations.list` and
`dates.propose`, which is most of what the app does.

Nothing was wrong with the migration. It was correct, committed, and verified
against a real Postgres before merge. CI even proved it applied cleanly to a
scratch database. The only defect was that a human had to remember to run it,
and the schema and the code could therefore ship apart.

`PROJECT_STATUS.md` recorded "all five are applied" while the repository
contained six. That is the drift in one line.

## Decision

The deploy applies migrations. `vercel.json` runs
`node scripts/db-migrate.mjs --deploy` after the build, so a deployment that
cannot bring the database up to date does not become the running version.

Three rules make that safe to leave unattended:

- **Production migrates; preview does not, unless asked.** A preview commonly
  points at the production database, and a preview build must not reshape it.
  `RUN_MIGRATIONS=1` opts a preview in.
- **A missing database URL fails the build.** Skipping quietly when the
  connection string is absent would recreate the original bug in a new place.
  `SKIP_DEPLOY_MIGRATIONS=1` is the deliberate escape hatch.
- **An advisory lock wraps the apply**, so two builds of the same merge cannot
  migrate at once.

The script is plain `.mjs` because it runs during the Vercel build, before
anything is compiled and with no tsx on the path.

## Consequences

- Schema and code ship together. The failure this ADR responds to cannot recur
  by omission — only by an explicit opt-out.
- Migrations run **before** the new deployment is promoted, so for a few seconds
  the schema is ahead of the code serving traffic. That is safe for additive
  migrations and is why the convention holds. A destructive change — dropping or
  renaming a column the current code still reads — still needs the two-step
  expand/contract dance in [runbooks/database.md](../runbooks/database.md), and
  the deploy step will not save you from getting it wrong.
- The database URL must be exposed to the **Build** step in Vercel, not only to
  the runtime. If it is not, deploys fail loudly with an error saying so.
- CI runs the same script against a throwaway Postgres, so the deploy path is
  exercised on every pull request rather than only in production.
- `pnpm db:status` answers "is this database behind?" on demand, which is the
  question nobody could answer quickly during the incident.
