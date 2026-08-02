# Database

PostgreSQL via Drizzle. `drizzle/schema.ts` is the canonical definition; see
[../architecture/data-model.md](../architecture/data-model.md) for what the tables mean.

## Two ways to apply a schema

|                | Command                                   | Use for                                                                                   |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Migrations** | `pnpm db:generate` then `pnpm db:migrate` | Anything deployed. Produces a reviewable SQL file that is committed and applied in order. |
| **Push**       | `pnpm db:push`                            | Local iteration only. Diffs and mutates the database directly, leaving no artifact.       |

`drizzle/0000_initial_schema.sql` is the baseline, with `drizzle/meta/` tracking
which migrations have run.

**Never use `db:push` against preview or production.** It leaves no record of
what changed, so a Vercel rollback would revert the code while the schema stayed
changed — and destructive edits get applied without a reviewed step.

## Changing the schema

1. Edit `drizzle/schema.ts`.
2. `pnpm db:generate` — writes a new numbered SQL file under `drizzle/`.
3. **Read the generated SQL.** It is the whole point of the step: check for
   dropped columns, narrowed types, or a rewrite of a large table.
4. `pnpm db:migrate` to apply it locally.
5. `pnpm check` — the change propagates through `server/db.ts` to every caller,
   so the compiler points at everything that needs updating.
6. Update [../architecture/data-model.md](../architecture/data-model.md) if the
   change is structural.
7. Commit the migration **with** the code that needs it, and run `pnpm verify`.

```bash
pnpm db:generate        # schema.ts -> a new migration file
pnpm db:migrate         # apply pending migrations to DATABASE_URL
pnpm db:migrate:doppler # same, against the production config
pnpm db:push            # local-only shortcut; no migration file
pnpm db:studio          # browse data
```

## The production database

The Supabase project `Trip Harmony` (`eqpqjivaubdbdmyrlczh`, eu-west-1) is the
live database. Two things about it are not derivable from `drizzle/schema.ts`:

- **RLS is enabled on every table with no policies, and `anon` /
  `authenticated` have no grants.** That is deliberate — see
  [ADR 0009](../adr/0009-rls-on-with-no-policies.md). Do not "fix" the linter's
  `rls_enabled_no_policy` notices by adding policies. A **new** environment does
  not inherit this; repeat it there.
- **It was originally built with `db:push`,** so drizzle had no record of
  0000/0001. A baseline row was inserted into `drizzle.__drizzle_migrations`
  (the hash of `0001_passkeys.sql` and its journal `when`) on 2026-08-02, and
  0002–0004 were applied and recorded. `pnpm db:migrate` is now correct against
  it and is a no-op until a new migration lands.

If you ever face this again — a schema built by `push` that now needs
migrations — the fix is one row. Drizzle's migrator compares only the **latest**
`created_at` in that table against each journal entry's `when`, so marking the
last already-applied migration is enough; it does not check the earlier ones.

## Deploying a schema change

Order matters: the migration must land **before** the code that depends on it.

1. Apply to the preview database first and exercise the app.
2. Back up production (your provider's snapshot or PITR).
3. Run `pnpm db:migrate` against production, then deploy the code.
4. Prefer additive steps: add a nullable column, backfill, and only make it
   required in a later migration. Never combine a destructive change with a
   feature deploy.

CI applies every migration to a throwaway Postgres on each PR, so a migration
that cannot run at all is caught before merge. That is a syntax and ordering
check, not a safety check — it says nothing about data loss.

## Connections

`getDb()` in `server/db.ts` lazily creates one pooled client per process and
reuses it. Three behaviours worth knowing:

- **Where the URL comes from.** `DATABASE_URL` first, then `POSTGRES_URL`
  (pooled) and `POSTGRES_URL_NON_POOLING`, which the Supabase/Vercel
  integration sets. A variable that isn't a Postgres URL is ignored rather than
  handed to the driver, which would otherwise fail as an opaque SSL error.
  `/api/health` reports which variable won, and which were ignored.
- **TLS.** Managed providers present a chain that isn't in Node's default trust
  store, and `sslmode=require` is now promoted to `verify-full`, so the
  connection string is rewritten to `sslmode=no-verify` for non-local hosts.
- **Serverless pooling.** Each function instance holds its own pool, so instance
  count multiplies connections. Use the pooled endpoint — Supabase: port 6543
  with `pgbouncer=true`, not the direct 5432 URL.

With no connection string configured, `getDb()` returns `null` and queries
no-op instead of throwing, so the app still boots for frontend work. Callers
handle the null case, and `/api/health` reports `"database": "missing"` — check
it before assuming data loss. Connections time out after 5s, and queries after
15s, rather than hanging forever.

## Local database

See [local-setup.md](local-setup.md). A disposable container is enough:

```bash
docker run -d --name back-to-travelling-db \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=back_to_travelling_dev \
  -p 5432:5432 postgres:16
```

To reset completely, drop and recreate the database, then `pnpm db:migrate`.

## Backups

Not automated by this repository — use your provider's (Supabase and Neon both
offer point-in-time recovery). Take a manual snapshot before any migration
against production.
