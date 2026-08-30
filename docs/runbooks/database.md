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
pnpm db:status          # what is DATABASE_URL missing? (exit 1 if behind)
pnpm db:status:doppler  # same question, asked of production
pnpm db:deploy          # apply via the same script the Vercel build runs
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

## Applying migrations without a Postgres connection

On 2026-08-29, migrations 0016–0018 were applied by hand. They are worth
recording because the method is not obvious and the trap in it is expensive.

**Why by hand.** Preview and production share one database
([ADR-0023](../adr/0023-preview-and-production-share-one-database.md)) and
preview deploys do not migrate, so a branch adding three migrations deployed
without its schema. Every query touching `users` failed on the missing
`deletedAt` — sign-in, `auth.me`, and taking a demo seat alike, which looked
like three unrelated bugs and was one.

**How.** Direct Postgres (port 5432/6543) is blocked from some environments —
an agent container, a locked-down network — so `pnpm db:deploy` cannot connect.
The Supabase Management API reaches the same database over HTTPS and can run
DDL, which is enough.

**The trap.** Applying the SQL that way leaves `drizzle.__drizzle_migrations`
untouched, so the repository still believes nothing was applied — and the next
production deploy re-runs the same migrations. `CREATE TYPE` has no
`IF NOT EXISTS` form, so that deploy fails and takes the release with it.

So each migration must be followed, in the same transaction, by the row
drizzle's own migrator would have written:

```sql
insert into drizzle.__drizzle_migrations ("hash", "created_at")
values ('<sha256 of the whole .sql file>', <the journal entry's "when">);
```

Both values are exact. The hash is `sha256` of the **entire file contents**,
not of any statement within it, and `created_at` is the `when` from
`drizzle/meta/_journal.json` — that is what `readMigrationFiles` in
`drizzle-orm/migrator.js` computes, and what `pendingSince` in
`scripts/lib/migrations.mjs` compares against. Get either wrong and the
migration is either applied twice or reported pending forever.

Compute them with:

```bash
node -e "const c=require('crypto'),f=require('fs');
  const j=JSON.parse(f.readFileSync('drizzle/meta/_journal.json'));
  for (const e of j.entries) console.log(e.tag, e.when,
    c.createHash('sha256').update(f.readFileSync('drizzle/'+e.tag+'.sql')).digest('hex'));"
```

Afterwards, confirm the repository agrees the database is current — `pnpm
db:status` where a connection exists, or check that
`max(created_at) in drizzle.__drizzle_migrations` equals the last journal
entry's `when`.

## Deploying a schema change

**The deploy applies migrations for you.** `vercel.json` runs
`node scripts/db-migrate.mjs --deploy` after the build, so a production
deployment brings the database up to date before it is promoted — see
[ADR 0010](../adr/0010-migrations-apply-on-deploy.md). This used to be a manual
step and, on 2026-08-02, a missed one: migration 0005 sat unapplied while the
code that needed `updatedAt` served traffic, and every vote read returned 500.

What that does and does not cover:

- **Production migrates automatically.** Preview does not, because a preview
  usually points at the production database; set `RUN_MIGRATIONS=1` on a preview
  that has its own.
- **A deploy that cannot reach its database fails.** If the build errors with
  "No Postgres URL in the build environment", the connection string is not
  exposed to the **Build** step in Vercel — fix that rather than working around
  it. `SKIP_DEPLOY_MIGRATIONS=1` exists but makes the old failure possible again.
- **Additive changes only.** Migrations run before the new code is promoted, so
  the schema is briefly ahead of the code. Adding a column is safe. Dropping or
  renaming one the current code still reads is not, and automation will not save
  you: expand and contract across two deploys instead.

So for anything destructive, or anything you want to watch:

1. Apply to the preview database first and exercise the app.
2. Back up production (your provider's snapshot or PITR).
3. Prefer additive steps: add a nullable column, backfill, and only make it
   required in a later migration. Never combine a destructive change with a
   feature deploy.
4. `pnpm db:status:doppler` answers "is production behind?" at any time.

CI applies every migration to a throwaway Postgres on each PR using the same
script the deploy runs, then checks that `drizzle/schema.ts` and the committed
migrations still agree — a column added to the schema with no migration to
create it fails the build. That is a syntax, ordering and drift check, not a
safety check: it says nothing about data loss.

## Connections

`getDb()` in `server/db.ts` lazily creates one pooled client per process and
reuses it. Three behaviours worth knowing:

- **Where the URL comes from.** `DATABASE_URL` first, then `POSTGRES_URL` and
  `POSTGRES_URL_NON_POOLING`, which the Supabase/Vercel integration sets. Treat
  those two as fallbacks in name only: this project's integration is an older
  version that points both at the direct, IPv6-only host, so neither can connect
  from Vercel. `DATABASE_URL` must stay set. A variable that isn't a Postgres
  URL is ignored rather than handed to the driver, which would otherwise fail as
  an opaque SSL error. `/api/health` reports which variable won, and which were
  ignored.
- **TLS.** Managed providers present a chain that isn't in Node's default trust
  store, and `sslmode=require` is now promoted to `verify-full`, so the
  connection string is rewritten to `sslmode=no-verify` for non-local hosts.
- **Serverless pooling.** Each function instance holds its own pool, so instance
  count multiplies connections. Use a **pooler** host
  (`…pooler.supabase.com`), never the direct `db.<ref>.supabase.co` host: the
  direct name is AAAA-only, and Vercel has no IPv6 egress, so it fails with
  `ENETUNREACH` in both builds and functions.

  Which pooler port matters. We use the **session pooler on 5432**, not the
  transaction pooler on 6543, because `scripts/db-migrate.mjs` takes a
  session-scoped `pg_advisory_lock`, runs `migrate()`, then unlocks — three
  round trips. Transaction pooling can hand each one a different backend, so
  the lock would exclude nothing, and the unlock would miss and strand the lock
  on a backend where a later deploy blocks on it. 6543 is the better fit for
  raw serverless connection count, so if instance growth ever makes 5432 the
  bottleneck, give the migration its own session-mode URL before moving the
  app's `DATABASE_URL` to 6543 — don't move them together.

  The pooler also changes the username: `postgres.<project-ref>`, not
  `postgres`.

- **The slot budget, and `EMAXCONNSESSION`.** The session pooler gives the whole
  project a fixed number of client slots — 15 here — and refuses the next
  connection outright rather than queueing it:

  ```
  (EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15
  ```

  Every warm instance draws on that one budget, so pg's default of 10
  connections per pool overruns it as soon as two instances are warm. `DB_POOL_MAX`
  caps it at 3 instead, which makes the surplus queue inside pg — cheap, and
  bounded by the 5s connection timeout — rather than fail. A connection the
  pooler still refuses is retried three times (60/180/420ms) before the query
  gives up; the retry is safe because the refusal happens before any statement
  is sent. `/api/health` reports `databasePoolMax`, and each retry logs
  `pooler out of connection slots, retrying` at `warn`.

  If those warnings become common, the fix is a lower fanout or a bigger budget
  — not a bigger `DB_POOL_MAX`, which only makes one instance crowd out the
  others.

With no connection string configured, `getDb()` returns `null` and queries
no-op instead of throwing, so the app still boots for frontend work. Callers
handle the null case, and `/api/health` reports `"database": "missing"` — check
it before assuming data loss. Connections time out after 5s, and queries after
15s, rather than hanging forever.

## Local database

See [local-setup.md](local-setup.md). A disposable container is enough:

```bash
docker run -d --name wevotrip-db \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=wevotrip_dev \
  -p 5432:5432 postgres:16
```

To reset completely, drop and recreate the database, then `pnpm db:migrate`.

## Backups

Not automated by this repository — use your provider's (Supabase and Neon both
offer point-in-time recovery). Take a manual snapshot before any migration
against production.
