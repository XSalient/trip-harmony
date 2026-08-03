/**
 * Reading and applying the committed migrations.
 *
 * Plain `.mjs` on purpose: this runs during the Vercel build, before anything
 * is compiled and without tsx on the path.
 *
 * `drizzle/meta/_journal.json` is the list of migrations that *should* exist;
 * the `drizzle.__drizzle_migrations` table is the list a given database has
 * actually run. Comparing the two is the whole job.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

export const MIGRATIONS_FOLDER = path.join(repoRoot, "drizzle");

/**
 * Same order as `resolveDatabaseUrl()` in server/_core/env.ts. Kept in step
 * deliberately: a deploy that migrates one database while the server reads
 * another is the failure this whole module exists to prevent.
 */
const DB_URL_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
];

export function resolveDatabaseUrl(env = process.env) {
  for (const key of DB_URL_KEYS) {
    const value = env[key]?.trim();
    if (value && /^postgres(ql)?:\/\//i.test(value)) {
      return { url: value, source: key };
    }
  }
  return { url: "", source: "" };
}

function isLocalUrl(url) {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/i.test(url);
}

/**
 * The same treatment `withRelaxedSsl()` in server/db.ts gives the runtime
 * connection, for the same reason: Supabase presents a chain that is not in
 * Node's default trust store, and recent pg-connection-string promotes
 * `sslmode=require` to `verify-full`, so the connection dies with
 * SELF_SIGNED_CERT_IN_CHAIN.
 *
 * It has to be done in the connection string, not the `ssl` client option — pg
 * builds its config as Object.assign({}, config, parse(connectionString)), so
 * anything parsed out of the string overwrites the explicit option. The
 * parameter is edited textually to avoid re-encoding credentials through the
 * URL parser.
 *
 * Kept in step with server/db.ts: a migration that cannot connect the way the
 * app connects is worse than useless, because it fails the deploy.
 */
export function withRelaxedSsl(url) {
  if (isLocalUrl(url)) return url;
  if (/[?&]sslmode=disable\b/i.test(url)) return url;
  if (/[?&]sslmode=/i.test(url)) {
    return url.replace(/([?&]sslmode=)[^&]*/i, "$1no-verify");
  }
  return `${url}${url.includes("?") ? "&" : "?"}sslmode=no-verify`;
}

/**
 * Whether a deploy build should migrate.
 *
 * Production always does. Preview only on request: a preview commonly points
 * at the production database, and a preview build must not reshape it.
 */
export function deployDecision(env = process.env) {
  if (env.SKIP_DEPLOY_MIGRATIONS === "1") {
    return { run: false, why: "SKIP_DEPLOY_MIGRATIONS=1" };
  }

  const target = env.VERCEL_ENV ?? env.APP_ENV ?? "development";

  if (target === "production") return { run: true, why: "production deploy" };
  if (env.RUN_MIGRATIONS === "1") {
    return { run: true, why: `RUN_MIGRATIONS=1 (${target})` };
  }
  return {
    run: false,
    why: `${target} deploy; set RUN_MIGRATIONS=1 to migrate this environment`,
  };
}

/** The migrations the repository says should be applied, in order. */
export async function readJournal(folder = MIGRATIONS_FOLDER) {
  const raw = await readFile(
    path.join(folder, "meta", "_journal.json"),
    "utf8"
  );
  const journal = JSON.parse(raw);
  return journal.entries
    .slice()
    .sort((a, b) => a.idx - b.idx)
    .map(entry => ({ idx: entry.idx, tag: entry.tag, when: entry.when }));
}

/**
 * Which journal entries this database has not run yet.
 *
 * Deliberately the same rule drizzle's own migrator uses: everything with a
 * `when` later than the newest recorded `created_at`. It is tempting to treat
 * the recorded rows as a set and report anything missing from it, but that
 * would be wrong here — production was built with `db:push` and then
 * *baselined* with a single row for 0001, so 0000 has no row and never will.
 * A set difference would report it as pending forever. See
 * docs/runbooks/database.md.
 *
 * A missing table means nothing has ever been applied, which is a legitimate
 * answer for a fresh database.
 */
export async function findPendingMigrations(
  client,
  folder = MIGRATIONS_FOLDER
) {
  const entries = await readJournal(folder);

  const { rows } = await client
    .query(
      `select max(created_at) as high_water from drizzle.__drizzle_migrations`
    )
    .catch(error => {
      // 42P01 undefined_table, 3F000 invalid_schema_name: nothing applied yet.
      if (error.code === "42P01" || error.code === "3F000") return { rows: [] };
      throw error;
    });

  return pendingSince(entries, rows[0]?.high_water);
}

/**
 * Split out from the query so the high-water rule can be tested directly,
 * including the baselined-production case.
 */
export function pendingSince(entries, highWater) {
  if (highWater === null || highWater === undefined) return entries;
  const mark = Number(highWater);
  return entries.filter(entry => entry.when > mark);
}
