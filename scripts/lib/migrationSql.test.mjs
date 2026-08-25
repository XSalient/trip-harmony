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

/**
 * Schema declarations and committed SQL have to say the same thing.
 *
 * `drizzle/schema.ts` is what the code reads and what a person editing the
 * model looks at; the `.sql` files are what actually reaches a database. In
 * this repository those two are kept in step by hand — `drizzle-kit generate`
 * cannot be used, because `drizzle/meta/` stops at snapshot 0007 while the
 * journal runs to 0015, so it would diff against a schema seven migrations
 * stale. That drift is worth fixing on its own; until it is, this test is what
 * stands in for the generator.
 *
 * AGENTS.md rule 9 says a column that ships without its migration takes
 * production down, and that it already did once. An index is gentler — nothing
 * breaks, it is merely slow, and nobody finds out for months.
 */
describe("every index declared in the schema is in a migration", () => {
  const schema = readFileSync(join(drizzleDir, "schema.ts"), "utf8");
  const allSql = files.map(sqlOf).join("\n");

  const declared = [...schema.matchAll(/\bindex\("([^"]+)"\)/g)].map(m => m[1]);

  it("the schema declares indexes at all", () => {
    // It declared none until 0015, which is how every table from the original
    // schema ended up unindexed.
    expect(declared.length).toBeGreaterThan(0);
  });

  for (const name of declared) {
    it(`${name} is created by a committed migration`, () => {
      expect(allSql).toContain(`"${name}"`);
    });
  }
});

describe("the journal and the migration files agree", () => {
  const journal = JSON.parse(
    readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8")
  );

  it("every journal entry has a file, and every file an entry", () => {
    const tags = journal.entries.map(e => e.tag).sort();
    expect(tags).toEqual(files.map(f => f.replace(/\.sql$/, "")).sort());
  });

  it("runs strictly forwards, so nothing is skipped by the high-water mark", () => {
    // `pendingSince` filters on `when`, so an entry out of order is a
    // migration that silently never applies.
    const whens = journal.entries.map(e => e.when);
    expect(whens).toEqual([...whens].sort((a, b) => a - b));
    expect(new Set(whens).size).toBe(whens.length);
  });
});
