#!/usr/bin/env node
/**
 * Applies committed migrations, or reports what a database is missing.
 *
 *   node scripts/db-migrate.mjs --check    report pending migrations, change nothing
 *   node scripts/db-migrate.mjs --apply    apply them
 *   node scripts/db-migrate.mjs --deploy   apply them if this deploy should (see below)
 *
 * `--deploy` runs from the Vercel build. It exists because the alternative —
 * a human remembering to run migrations by hand after every merge — failed:
 * 0005 added `updatedAt` to the vote tables, the code shipped, the column
 * didn't, and every vote read returned 500 until someone noticed.
 *
 * Migrations run during the build, so the schema is ahead of the code for the
 * few seconds before the new deployment is promoted. That ordering is only
 * safe for additive migrations; a destructive one still needs the two-step
 * dance in docs/runbooks/database.md.
 */

import process from "node:process";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  MIGRATIONS_FOLDER,
  deployDecision,
  findPendingMigrations,
  resolveDatabaseUrl,
  withRelaxedSsl,
} from "./lib/migrations.mjs";

// Any 64-bit constant works; it only has to be the same in every build.
const ADVISORY_LOCK_KEY = 4_073_219_551;

function parseMode(argv) {
  if (argv.includes("--check")) return "check";
  if (argv.includes("--apply")) return "apply";
  if (argv.includes("--deploy")) return "deploy";
  return "check";
}

async function withClient(url, fn) {
  const client = new Client({ connectionString: withRelaxedSsl(url) });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function describe(pending) {
  return pending.map(entry => entry.tag).join(", ");
}

async function main() {
  const mode = parseMode(process.argv.slice(2));

  if (mode === "deploy") {
    const decision = deployDecision(process.env);
    if (!decision.run) {
      console.log(`[migrate] skipped: ${decision.why}`);
      return;
    }
    console.log(`[migrate] running: ${decision.why}`);
  }

  const { url, source } = resolveDatabaseUrl();

  if (!url) {
    // Silently skipping here is precisely how the schema and the code drifted
    // apart, so a deploy that cannot reach its database fails instead.
    if (mode === "deploy") {
      throw new Error(
        "No Postgres URL in the build environment (looked at DATABASE_URL, " +
          "POSTGRES_URL, POSTGRES_URL_NON_POOLING). The deploy cannot confirm " +
          "the database matches the code it is shipping. Expose the variable to " +
          "the Build step in the Vercel project settings, or set " +
          "SKIP_DEPLOY_MIGRATIONS=1 to accept the risk deliberately."
      );
    }
    throw new Error("No Postgres URL found. Set DATABASE_URL and retry.");
  }

  console.log(`[migrate] database from ${source}`);

  await withClient(url, async client => {
    if (mode === "check") {
      const pending = await findPendingMigrations(client, MIGRATIONS_FOLDER);
      if (pending.length === 0) {
        console.log("[migrate] up to date");
        return;
      }
      // Non-zero so CI or a runbook step can gate on it.
      console.error(
        `[migrate] ${pending.length} migration(s) not applied: ${describe(pending)}`
      );
      process.exitCode = 1;
      return;
    }

    // Two builds of the same merge can start together; only one may migrate.
    //
    // This lock is session-scoped and is held across three round trips (lock,
    // migrate, unlock), so DATABASE_URL must reach a connection that keeps one
    // backend for the whole session: a direct host or Supabase's *session*
    // pooler on 5432. Behind a transaction pooler (6543) each statement can
    // land on a different backend, so the lock would exclude nothing and the
    // unlock would miss, stranding it until that backend closes — and a later
    // deploy would then block on it. If you ever need 6543 for the app, give
    // this script its own session-mode URL rather than moving both.
    await client.query("select pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    try {
      const pending = await findPendingMigrations(client, MIGRATIONS_FOLDER);
      if (pending.length === 0) {
        console.log("[migrate] up to date, nothing to apply");
        return;
      }

      console.log(`[migrate] applying ${pending.length}: ${describe(pending)}`);
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
      console.log("[migrate] done");
    } finally {
      await client.query("select pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    }
  });
}

main().catch(error => {
  console.error(`[migrate] failed: ${error.message}`);
  process.exit(1);
});
