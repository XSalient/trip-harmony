/**
 * Reporting, blocking, and the content filter's reach across the API.
 *
 * Like the other router tests these run without a database, so what is asserted
 * is what must hold before any work happens: who may call what, and that the
 * filter refuses a mutation regardless of which router it belongs to.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appRouter } from "./index.js";
import type { TrpcContext } from "../_core/context.js";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(userId = 1, role: "user" | "admin" = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
    name: "Test User",
    loginMethod: "manus",
    role,
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

describe("the content filter reaches every mutation", () => {
  it("refuses a dirty comment", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.comments.add({
        proposalType: "date",
        proposalId: 1,
        tripId: 1,
        content: "this is shit",
      })
    ).rejects.toThrow(/can't include/i);
  });

  /**
   * The filter is middleware, so it runs before the resolver — and therefore
   * before `requireTripRole`. Asserting the *filter's* message here rather than
   * "not a member" is what pins that ordering down: a filter that only ran
   * after authorisation would let a trip's own members through unchecked in any
   * router that authorises later than it stores.
   */
  it("refuses before the resolver's own checks run", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.trips.create({ name: "the shit trip" })
    ).rejects.toThrow(/can't include/i);
  });

  it("reaches a router it was never wired into by hand", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.groups.create({ tripId: 1, name: "bastards" })
    ).rejects.toThrow(/can't include/i);
  });

  it("names the field, so the fix is obvious", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.preferences.save({
        tripId: 1,
        mustHaves: "no shit please",
        strongPreferences: "",
        avoids: "",
        openComments: "",
      })
    ).rejects.toThrow(/must-haves/i);
  });

  it("lets ordinary trip talk through to the resolver", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // Reaches `requireTripRole` and is refused there — which is the point: the
    // filter did not stop it.
    await expect(
      caller.comments.add({
        proposalType: "date",
        proposalId: 1,
        tripId: 1,
        content: "Can we push this back a week?",
      })
    ).rejects.toThrow(/not a member/i);
  });

  it("never inspects scraped listing text", () => {
    // `pageText` is up to 400kB of somebody else's HTML. Filtering it would
    // reject a legitimate import over a word on a hotel's own page, which is
    // why the middleware works from an allow-list of prose fields.
    const src = readFileSync(
      join(import.meta.dirname, "../_core/trpc.ts"),
      "utf8"
    );
    const list = src.slice(
      src.indexOf("const USER_TEXT_FIELDS"),
      src.indexOf("};", src.indexOf("const USER_TEXT_FIELDS"))
    );
    for (const field of ["pageText", "url", "email", "password", "token"]) {
      expect(list, `${field} must never be filtered`).not.toContain(
        `${field}:`
      );
    }
  });
});

describe("moderation.report", () => {
  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.moderation.report({
        contentType: "comment",
        contentId: 1,
        reason: "spam",
      })
    ).rejects.toThrow();
  });

  it("refuses a report about yourself", async () => {
    const caller = appRouter.createCaller(makeCtx(7));
    await expect(
      caller.moderation.report({
        contentType: "member",
        contentId: 7,
        reason: "harassment",
      })
    ).rejects.toThrow(/yourself/i);
  });

  it("checks trip membership before accepting a trip-scoped report", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.moderation.report({
        contentType: "comment",
        contentId: 1,
        tripId: 999,
        reason: "spam",
      })
    ).rejects.toThrow(/not a member/i);
  });
});

describe("moderation.block", () => {
  it("refuses to block yourself", async () => {
    const caller = appRouter.createCaller(makeCtx(4));
    await expect(caller.moderation.block({ userId: 4 })).rejects.toThrow(
      /yourself/i
    );
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.moderation.block({ userId: 2 })).rejects.toThrow();
    await expect(caller.moderation.blocks()).rejects.toThrow();
  });
});

describe("the moderation queue is app-admin only", () => {
  it("refuses an ordinary signed-in user", async () => {
    const caller = appRouter.createCaller(makeCtx(1, "user"));
    await expect(caller.moderation.queue()).rejects.toThrow();
    await expect(caller.moderation.openCount()).rejects.toThrow();
    await expect(
      caller.moderation.resolve({ id: 1, status: "dismissed" })
    ).rejects.toThrow();
  });

  it("refuses a signed-out caller", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.moderation.queue()).rejects.toThrow();
  });
});
