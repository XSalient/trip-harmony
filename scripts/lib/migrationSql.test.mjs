/**
 * What a committed migration is allowed to assume about the database it lands on.
 *
 * It lands on three: a bare Postgres in CI, a scratch Postgres on somebody's
 * machine, and Supabase in production. Only the third has the `anon` and
 * `authenticated` roles that ADR 0009 revokes from — so an unguarded
 * `REVOKE ... FROM anon` is valid in exactly one of the three and fails the
 * other two.
 *
 * That is not hypothetical: 0008–0010 shipped with unguarded REVOKEs, passed
 * locally because the roles had been created by hand in the scratch database,
 * and turned "Migrations apply cleanly" red on the first push. The lesson is
 * the test: the environment a migration is proved against has to be the
 * environment it will meet, and where it cannot be, the assumption has to be
 * guarded and the guard asserted.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const drizzleDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle"
);
const files = readdirSync(drizzleDir)
  .filter(f => f.endsWith(".sql"))
  .sort();

const sqlOf = f => readFileSync(join(drizzleDir, f), "utf8");

/** Lines with the SQL comments stripped, so prose about REVOKE is not a hit. */
function statements(sql) {
  return sql
    .split("\n")
    .filter(line => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("every migration applies to a database without Supabase's roles", () => {
  it("there are migrations to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const body = statements(sqlOf(file));

    it(`${file} names anon or authenticated only inside a role-existence guard`, () => {
      const mentions = /\b(anon|authenticated)\b/.test(body);
      if (!mentions) return;
      // The guard: the statement must be reached only when the role is there.
      expect(
        body,
        `${file} names a Supabase role outside a pg_roles guard — it will fail on a bare Postgres`
      ).toMatch(/pg_roles\s+WHERE\s+rolname/i);
    });

    it(`${file} issues no bare REVOKE against a role that may not exist`, () => {
      // `REVOKE ... FROM anon` as a plain statement. Inside the guard the
      // revoke is built with format() and executed, so it never appears as
      // literal SQL naming the role.
      expect(body).not.toMatch(
        /REVOKE\s+[\s\S]{0,120}?FROM\s+(anon|authenticated)\b/i
      );
    });
  }
});

describe("the guard is real, not decorative", () => {
  const guarded = files.filter(f => /pg_roles/i.test(sqlOf(f)));

  it("at least one migration closes its new tables this way", () => {
    expect(guarded.length).toBeGreaterThan(0);
  });

  for (const file of guarded) {
    it(`${file} revokes from both roles, and only when each exists`, () => {
      const sql = sqlOf(file);
      expect(sql).toContain("'anon', 'authenticated'");
      expect(sql).toMatch(
        /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = target\)/
      );
      expect(sql).toMatch(/EXECUTE format\('REVOKE ALL ON TABLE %I FROM %I'/);
    });

    it(`${file} enables row level security on what it creates`, () => {
      // Portable, unlike the revoke: no roles involved, so this one belongs in
      // the migration on every database. ADR 0009.
      const created = [
        ...sqlOf(file).matchAll(/CREATE TABLE IF NOT EXISTS "([^"]+)"/g),
      ].map(m => m[1]);
      for (const table of created) {
        expect(sqlOf(file)).toContain(
          `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`
        );
      }
    });
  }
});
