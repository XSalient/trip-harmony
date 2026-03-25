import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1, name = "Test User"): { ctx: TrpcContext; clearedCookies: any[] } {
  const clearedCookies: any[] = [];

  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
    name,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("auth.me", () => {
  it("returns null for unauthenticated users", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user data for authenticated users", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.id).toBe(1);
    expect(result?.name).toBe("Test User");
  });
});

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
  });
});

describe("travelDna.save input validation", () => {
  it("rejects values outside 1-10 range", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.travelDna.save({
        budgetComfort: 0,
        socialEnergy: 5,
        adventureLevel: 5,
        planningStyle: 5,
        culturalCuriosity: 5,
        comfortNeed: 5,
        foodPriority: 5,
        activityPace: 5,
      })
    ).rejects.toThrow();
  });

  it("rejects values above 10", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.travelDna.save({
        budgetComfort: 11,
        socialEnergy: 5,
        adventureLevel: 5,
        planningStyle: 5,
        culturalCuriosity: 5,
        comfortNeed: 5,
        foodPriority: 5,
        activityPace: 5,
      })
    ).rejects.toThrow();
  });
});

describe("trips.create input validation", () => {
  it("rejects empty trip names", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.trips.create({ name: "", currency: "USD" })
    ).rejects.toThrow();
  });
});

describe("trips.update input validation", () => {
  it("accepts valid phase values", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This should not throw on input validation (may throw on DB)
    try {
      await caller.trips.update({ id: 999999, phase: "dates" });
    } catch (e: any) {
      // DB error is expected since trip doesn't exist, but input validation should pass
      expect(e.message).not.toContain("invalid_enum_value");
    }
  });
});

describe("budget.add input validation", () => {
  it("rejects empty description", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.budget.add({
        tripId: 1,
        category: "food",
        description: "",
        amount: "100",
      })
    ).rejects.toThrow();
  });

  it("rejects invalid category", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.budget.add({
        tripId: 1,
        category: "invalid" as any,
        description: "test",
        amount: "100",
      })
    ).rejects.toThrow();
  });
});

describe("destinations.vote input validation", () => {
  it("rejects invalid vote values", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.destinations.vote({
        destinationId: 1,
        vote: "invalid" as any,
      })
    ).rejects.toThrow();
  });

  it("accepts valid vote values", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Should not throw on input validation (may throw on DB)
    for (const vote of ["love", "fine", "veto"] as const) {
      try {
        await caller.destinations.vote({ destinationId: 999999, vote });
      } catch (e: any) {
        // DB error is expected, but input validation should pass
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });
});

describe("accommodations.vote input validation", () => {
  it("rejects invalid vote values", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.accommodations.vote({
        accommodationId: 1,
        vote: "invalid" as any,
      })
    ).rejects.toThrow();
  });
});

describe("dates.vote input validation", () => {
  it("rejects invalid vote values", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.dates.vote({
        proposalId: 1,
        vote: "invalid" as any,
      })
    ).rejects.toThrow();
  });
});
