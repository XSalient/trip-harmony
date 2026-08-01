import { describe, expect, it } from "vitest";
import type { User } from "../../drizzle/schema.js";
import { hashPassword, toPublicUser, verifyPassword } from "./_shared.js";

const user: User = {
  id: 1,
  openId: "email:abc",
  name: "Dev User",
  email: "dev@example.com",
  passwordHash: "salt:deadbeef",
  loginMethod: "email",
  role: "user",
  avatarUrl: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  lastSignedIn: new Date("2026-01-02"),
};

describe("toPublicUser", () => {
  it("never exposes the password hash", () => {
    const publicUser = toPublicUser(user);
    expect(publicUser).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(publicUser)).not.toContain("deadbeef");
  });

  it("keeps the fields the client needs", () => {
    expect(toPublicUser(user)).toEqual({
      id: 1,
      openId: "email:abc",
      name: "Dev User",
      email: "dev@example.com",
      role: "user",
      avatarUrl: null,
      loginMethod: "email",
      createdAt: new Date("2026-01-01"),
      lastSignedIn: new Date("2026-01-02"),
    });
  });

  it("is an allow-list, so a new column cannot leak by default", () => {
    // Simulates a column added to `users` later without updating the projection.
    const withNewSecret = { ...user, apiToken: "should-not-appear" } as User;
    expect(JSON.stringify(toPublicUser(withNewSecret))).not.toContain(
      "should-not-appear"
    );
  });

  it("passes null through for signed-out callers", () => {
    expect(toPublicUser(null)).toBeNull();
    expect(toPublicUser(undefined)).toBeNull();
  });
});

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(
      verifyPassword("correct horse battery staple", hash)
    ).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("salts, so the same password hashes differently each time", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same"),
      hashPassword("same"),
    ]);
    expect(a).not.toBe(b);
  });
});
