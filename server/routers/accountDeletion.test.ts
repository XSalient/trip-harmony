/**
 * Deleting your own account.
 *
 * Like the other router tests these run without a database — `getDb()` returns
 * null when no connection string is configured — so what is asserted here is
 * the part that must hold before any work happens: who may call it, and what
 * the cascade is obliged to cover.
 *
 * The coverage checks read `drizzle/schema.ts` and `server/db.ts` as text. That
 * is deliberate. This schema declares no foreign keys, so a table added later
 * with a `userId` column would otherwise survive its owner's deletion silently,
 * and the first anyone heard of it would be a privacy complaint.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appRouter } from "./index.js";
import { USER_ROWS_ANONYMISED, USER_ROWS_DELETED } from "../db.js";
import type { TrpcContext } from "../_core/context.js";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(userId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

function makeUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      cookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

const readSource = (relative: string) =>
  readFileSync(join(import.meta.dirname, relative), "utf8");

describe("auth.deleteAccount", () => {
  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.auth.deleteAccount({ confirm: "DELETE" })
    ).rejects.toThrow();
  });

  it("refuses anything but the exact confirmation word", async () => {
    const caller = appRouter.createCaller(makeCtx());
    for (const confirm of ["delete", "Delete", "DELETE ", "", "yes"]) {
      await expect(
        // @ts-expect-error — the literal is the point: these must not typecheck
        // for a caller either, and must be rejected at runtime regardless.
        caller.auth.deleteAccount({ confirm })
      ).rejects.toThrow();
    }
  });

  it("reports the impact only to a signed-in caller", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.auth.deletionImpact()).rejects.toThrow();
  });
});

describe("the deletion cascade covers every table that names a user", () => {
  /** Tables in the schema with a `userId` column, read from the schema itself. */
  function tablesWithUserId(): Set<string> {
    const src = readSource("../../drizzle/schema.ts");
    const found = new Set<string>();
    for (const block of src.split("pgTable(").slice(1)) {
      const table = block.match(/^\s*"([a-z_]+)"/)?.[1];
      if (!table) continue;
      const body = block.slice(0, block.indexOf("});"));
      if (/\buserId:\s*integer\(/.test(body)) found.add(table);
    }
    return found;
  }

  it("classifies each one as deleted or anonymised, and nothing twice", () => {
    const declared = [...USER_ROWS_DELETED, ...USER_ROWS_ANONYMISED];
    expect(new Set(declared).size).toBe(declared.length);

    const inSchema = tablesWithUserId();
    expect(inSchema.size).toBeGreaterThan(0);
    expect([...inSchema].sort()).toEqual([...declared].sort());
  });

  it("actually deletes every table on the deleted list", () => {
    const src = readSource("../db.ts");
    const fn = src.slice(
      src.indexOf("export async function deleteUserCascade"),
      src.indexOf("// ---- Trips ----")
    );
    expect(fn).toContain("db.transaction");

    // Table name in the schema -> the Drizzle export the cascade calls.
    const camel = (t: string) =>
      t.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    for (const table of USER_ROWS_DELETED) {
      expect(
        new RegExp(`delete\\(${camel(table)}\\)`).test(fn),
        `deleteUserCascade never deletes from ${table}`
      ).toBe(true);
    }
  });

  it("leaves the anonymised tables alone", () => {
    const src = readSource("../db.ts");
    const fn = src.slice(
      src.indexOf("export async function deleteUserCascade"),
      src.indexOf("// ---- Trips ----")
    );
    const camel = (t: string) =>
      t.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    for (const table of USER_ROWS_ANONYMISED) {
      expect(
        new RegExp(`delete\\(${camel(table)}\\)`).test(fn),
        `${table} is meant to survive deletion, anonymised — not be deleted`
      ).toBe(false);
    }
  });

  it("clears every column that could identify or sign in the account", () => {
    const src = readSource("../db.ts");
    const fn = src.slice(
      src.indexOf("export async function deleteUserCascade"),
      src.indexOf("// ---- Trips ----")
    );
    // The scrub is the whole privacy claim: an account that keeps its row must
    // keep nothing that names the person or lets anyone back in as them.
    for (const field of [
      "openId",
      "email",
      "name",
      "passwordHash",
      "avatarUrl",
      "loginMethod",
      "deletedAt",
    ]) {
      expect(fn, `the scrub does not clear ${field}`).toContain(`${field}:`);
    }
    // Magic links are keyed by address, so they outlive the row unless they go
    // before the address does.
    expect(fn).toContain("delete(magicLinkTokens)");
  });

  it("hands a trip on before it considers deleting one", () => {
    const src = readSource("../db.ts");
    const fn = src.slice(
      src.indexOf("export async function deleteUserCascade"),
      src.indexOf("// ---- Trips ----")
    );
    // Only trips with nobody left in them are deleted, and `planAccountDeletion`
    // is what decides which those are — shared with `deletionImpact` so the
    // warning shown to the user cannot disagree with what happens.
    expect(fn).toContain("planAccountDeletion");
    expect(fn.indexOf("planAccountDeletion")).toBeLessThan(
      fn.indexOf("deleteTripCascade")
    );
  });
});
