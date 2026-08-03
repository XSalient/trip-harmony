import { describe, expect, it } from "vitest";
import {
  deployDecision,
  pendingSince,
  readJournal,
  resolveDatabaseUrl,
} from "./migrations.mjs";

describe("resolveDatabaseUrl", () => {
  it("prefers DATABASE_URL, then the pooled Vercel/Supabase variable", () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: "postgres://a/db",
        POSTGRES_URL: "postgres://b/db",
      })
    ).toEqual({ url: "postgres://a/db", source: "DATABASE_URL" });

    expect(resolveDatabaseUrl({ POSTGRES_URL: "postgres://b/db" }).source).toBe(
      "POSTGRES_URL"
    );
  });

  it("skips a variable that does not hold a Postgres URL", () => {
    // A leftover MySQL or HTTP URL fails deep in the driver; skip it here.
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: "mysql://a/db",
        POSTGRES_URL: "postgresql://b/db",
      })
    ).toEqual({ url: "postgresql://b/db", source: "POSTGRES_URL" });
  });

  it("reports nothing found rather than guessing", () => {
    expect(resolveDatabaseUrl({}).url).toBe("");
  });
});

describe("deployDecision", () => {
  it("migrates on a production deploy", () => {
    expect(deployDecision({ VERCEL_ENV: "production" }).run).toBe(true);
  });

  it("leaves preview alone unless asked", () => {
    // A preview usually points at the production database.
    expect(deployDecision({ VERCEL_ENV: "preview" }).run).toBe(false);
    expect(
      deployDecision({ VERCEL_ENV: "preview", RUN_MIGRATIONS: "1" }).run
    ).toBe(true);
  });

  it("honours an explicit opt-out even in production", () => {
    expect(
      deployDecision({ VERCEL_ENV: "production", SKIP_DEPLOY_MIGRATIONS: "1" })
        .run
    ).toBe(false);
  });

  it("does not migrate from a local build by accident", () => {
    expect(deployDecision({}).run).toBe(false);
  });
});

describe("pendingSince", () => {
  const entries = [
    { idx: 0, tag: "0000_initial", when: 100 },
    { idx: 1, tag: "0001_passkeys", when: 200 },
    { idx: 2, tag: "0002_later", when: 300 },
  ];

  it("treats a database with no record as needing everything", () => {
    expect(pendingSince(entries, null)).toHaveLength(3);
    expect(pendingSince(entries, undefined)).toHaveLength(3);
  });

  it("reports only what is newer than the high-water mark", () => {
    expect(pendingSince(entries, 200).map(e => e.tag)).toEqual(["0002_later"]);
  });

  it("reports nothing when the mark is at the newest migration", () => {
    expect(pendingSince(entries, 300)).toEqual([]);
  });

  it("does not resurrect a migration skipped by baselining", () => {
    // Production was built with db:push and baselined at 0001, so 0000 has no
    // row and never will. Comparing recorded rows as a set would report it as
    // pending forever; the high-water rule does not.
    expect(pendingSince(entries, 200).map(e => e.tag)).not.toContain(
      "0000_initial"
    );
  });

  it("accepts the string a bigint column comes back as", () => {
    // node-postgres returns int8 as a string; a lexical compare would break.
    expect(pendingSince(entries, "200").map(e => e.tag)).toEqual([
      "0002_later",
    ]);
  });
});

describe("readJournal", () => {
  it("lists the committed migrations in order", async () => {
    const entries = await readJournal();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map(entry => entry.idx)).toEqual(
      entries.map((_, index) => index)
    );
    // The migration whose absence from production caused the outage.
    expect(entries.map(entry => entry.tag)).toContain(
      "0005_activity_and_vote_times"
    );
  });
});
