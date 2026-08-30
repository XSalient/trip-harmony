/**
 * The paywall, and the one rule that keeps it from being a formality.
 *
 * Nothing here can buy anything: the only thing that records a purchase is
 * RevenueCat's webhook, and the tests below assert that no procedure offers a
 * second route to the same effect. A client that could tell this server it had
 * paid could grant itself the product, so "there is no such procedure" is the
 * security property, and it is worth a test rather than a comment.
 *
 * Like the other router tests these run without a database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appRouter } from "./index.js";
import type { TrpcContext } from "../_core/context.js";
import {
  FREE_ACTIVE_TRIP_LIMIT,
  isEntitled,
  TRIP_LIMIT_ERR_MSG,
} from "../../shared/billing.js";

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

const read = (relative: string) =>
  readFileSync(join(import.meta.dirname, relative), "utf8");

describe("nothing but the webhook can grant the product", () => {
  it("exposes no procedure that writes a subscription", () => {
    const src = read("billing.ts");
    // A mutation here would be the hole: the router is reachable by any
    // signed-in client, and a purchase is a fact the store owns.
    expect(src).not.toContain(".mutation(");
    for (const name of ["purchase", "subscribe", "grant", "redeem"]) {
      expect(src, `billing.ts must not expose a ${name} procedure`).not.toMatch(
        new RegExp(`^\\s{2}${name}:`, "m")
      );
    }
  });

  it("writes subscriptions from exactly one place", () => {
    // `upsertSubscription` is the only writer, and only the webhook calls it.
    const callers = ["billing.ts", "trips.ts", "auth.ts", "_shared.ts"];
    for (const file of callers) {
      expect(read(file), `${file} must not write a subscription`).not.toContain(
        "upsertSubscription"
      );
    }
    expect(read("../utils/revenueCatWebhook.ts")).toContain(
      "db.upsertSubscription"
    );
  });

  it("verifies the webhook secret in constant time", () => {
    const src = read("../utils/revenueCatWebhook.ts");
    // `===` on a secret leaks its length and matching prefix through timing.
    expect(src).toContain("timingSafeEqual");
    expect(src).toContain("401");
  });
});

describe("billing.status", () => {
  it("is not readable signed out", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(caller.billing.status()).rejects.toThrow();
    await expect(caller.billing.config({ platform: "ios" })).rejects.toThrow();
  });

  it("reports the free allowance to a signed-in caller", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const status = await caller.billing.status();
    expect(status.freeLimit).toBe(FREE_ACTIVE_TRIP_LIMIT);
    // No RevenueCat key is configured in tests, so nothing is enforced and
    // everybody is entitled — the deliberate "this deployment does not charge"
    // state, not a bug.
    expect(status.enforced).toBe(false);
    expect(status.entitled).toBe(true);
    expect(status.atLimit).toBe(false);
  });
});

describe("the trip allowance is enforced where trips are made", () => {
  it("gates both ways of creating one", () => {
    const src = read("trips.ts");
    // Cloning makes a trip like any other. Gating only `create` would make the
    // limit one click to bypass.
    const create = src.slice(src.indexOf("  create: protectedProcedure"));
    const clone = src.slice(src.indexOf("  clone: protectedProcedure"));
    expect(create.slice(0, clone.length || undefined)).toContain(
      "requireTripAllowance"
    );
    expect(clone).toContain("requireTripAllowance");
  });

  it("checks the trip role before the paywall on clone", () => {
    const src = read("trips.ts");
    const clone = src.slice(src.indexOf("  clone: protectedProcedure"));
    const body = clone.slice(0, clone.indexOf("  delete:"));
    // Somebody who cannot clone this trip should be told that, not shown a
    // paywall for something they could not do anyway.
    expect(body.indexOf("requireTripRole")).toBeLessThan(
      body.indexOf("requireTripAllowance")
    );
  });

  it("fails closed when billing is configured but nothing was bought", () => {
    const src = read("_shared.ts");
    const fn = src.slice(
      src.indexOf("export async function requireTripAllowance"),
      src.indexOf("export type PublicUser")
    );
    // The two deliberate ways through — a paused product and a deployment with
    // no billing set up — and nothing else. In particular, an account with no
    // subscription row is free rather than entitled.
    expect(fn).toContain("config.billing.enabled");
    expect(fn).toContain("config.billing.isConfigured");
    expect(fn).toContain("isEntitled");
    // The shared constant, not a literal: the client watches for this exact
    // message to open the paywall, so the two sides must not be able to drift.
    expect(fn).toContain("TRIP_LIMIT_ERR_MSG");
    expect(TRIP_LIMIT_ERR_MSG).toMatch(/10003/);
  });
});

describe("isEntitled", () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it("treats no subscription as free", () => {
    expect(isEntitled(null)).toBe(false);
    expect(isEntitled(undefined)).toBe(false);
    expect(isEntitled({ status: "none" })).toBe(false);
  });

  it("entitles an active subscription", () => {
    expect(isEntitled({ status: "active", expiresAt: future })).toBe(true);
  });

  it("keeps entitling through a billing issue", () => {
    // The store is retrying a card that will probably work. Locking somebody
    // out of a half-planned trip over a temporary decline is worse than a few
    // days of unpaid access.
    expect(isEntitled({ status: "billing_issue", expiresAt: future })).toBe(
      true
    );
    expect(isEntitled({ status: "in_grace_period", expiresAt: future })).toBe(
      true
    );
  });

  it("stops at the expiry date even if the status says otherwise", () => {
    // A webhook that never arrived must not entitle somebody forever.
    expect(isEntitled({ status: "active", expiresAt: past })).toBe(false);
  });

  it("treats a null expiry as no expiry", () => {
    expect(isEntitled({ status: "active", expiresAt: null })).toBe(true);
  });

  it("never entitles an expired one", () => {
    expect(isEntitled({ status: "expired", expiresAt: future })).toBe(false);
  });
});
