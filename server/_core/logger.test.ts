import { describe, expect, it } from "vitest";
import { redact } from "./logger.js";

describe("redact", () => {
  it("replaces secret-looking keys at the top level", () => {
    expect(redact({ email: "a@b.com", password: "hunter2" })).toEqual({
      email: "a@b.com",
      password: "[redacted]",
    });
  });

  it("matches key names case-insensitively", () => {
    const out = redact({
      passwordHash: "x",
      Authorization: "Bearer y",
      apiKey: "z",
    }) as Record<string, unknown>;
    expect(out.passwordHash).toBe("[redacted]");
    expect(out.Authorization).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
  });

  it("reaches into nested objects and arrays", () => {
    const out = redact({
      users: [{ name: "a", passwordHash: "secret" }],
      config: { db: { database_url: "postgres://user:pw@host/db" } },
    }) as any;
    expect(out.users[0].name).toBe("a");
    expect(out.users[0].passwordHash).toBe("[redacted]");
    expect(out.config.db.database_url).toBe("[redacted]");
  });

  it("serialises errors instead of dropping them to an empty object", () => {
    const out = redact(new Error("boom")) as Record<string, unknown>;
    expect(out.name).toBe("Error");
    expect(out.message).toBe("boom");
    expect(out.stack).toContain("boom");
  });

  it("stops recursing on deeply nested input rather than overflowing", () => {
    let deep: any = "leaf";
    for (let i = 0; i < 20; i++) deep = { next: deep };
    expect(() => redact(deep)).not.toThrow();
    expect(JSON.stringify(redact(deep))).toContain("[truncated]");
  });

  it("passes primitives and nullish values through unchanged", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
    expect(redact(42)).toBe(42);
    expect(redact("plain")).toBe("plain");
  });
});
