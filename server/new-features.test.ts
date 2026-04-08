import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(userId = 1, name = "Test User"): TrpcContext {
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
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function makeUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── Unvote: dates ───────────────────────────────────────────────────────────

describe("dates.unvote input validation", () => {
  it("requires a numeric proposalId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.dates.unvote({ proposalId: "abc" as any })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.dates.unvote({ proposalId: 1 })
    ).rejects.toThrow();
  });
});

// ─── Unvote: destinations ─────────────────────────────────────────────────────

describe("destinations.unvote input validation", () => {
  it("requires a numeric destinationId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.destinations.unvote({ destinationId: "abc" as any })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.destinations.unvote({ destinationId: 1 })
    ).rejects.toThrow();
  });
});

// ─── Unvote: accommodations ───────────────────────────────────────────────────

describe("accommodations.unvote input validation", () => {
  it("requires a numeric accommodationId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.accommodations.unvote({ accommodationId: "abc" as any })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.accommodations.unvote({ accommodationId: 1 })
    ).rejects.toThrow();
  });
});

// ─── Comments: countsByTrip ───────────────────────────────────────────────────

describe("comments.countsByTrip input validation", () => {
  it("requires a numeric tripId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.comments.countsByTrip({ tripId: "abc" as any })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.comments.countsByTrip({ tripId: 1 })
    ).rejects.toThrow();
  });
});

// ─── Vibe Board ───────────────────────────────────────────────────────────────

describe("vibeBoard.add input validation", () => {
  it("rejects empty title", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.vibeBoard.add({ tripId: 1, title: "" })
    ).rejects.toThrow();
  });

  it("accepts a valid title with optional fields omitted", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      await caller.vibeBoard.add({ tripId: 999999, title: "Beach vibes" });
    } catch (e: any) {
      // DB error expected (trip doesn't exist), but NOT a validation error
      expect(e.message).not.toMatch(/too_small|invalid_type/);
    }
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.vibeBoard.add({ tripId: 1, title: "Test" })
    ).rejects.toThrow();
  });
});

describe("vibeBoard.vote input validation", () => {
  it("rejects invalid vote values", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.vibeBoard.vote({ vibeItemId: 1, vote: "maybe" as any })
    ).rejects.toThrow();
  });

  it("accepts valid vote values without crashing on validation", async () => {
    const caller = appRouter.createCaller(makeCtx());
    for (const vote of ["love", "fine", "veto"] as const) {
      try {
        await caller.vibeBoard.vote({ vibeItemId: 999999, vote });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.vibeBoard.vote({ vibeItemId: 1, vote: "love" })
    ).rejects.toThrow();
  });
});

describe("vibeBoard.unvote input validation", () => {
  it("requires a numeric vibeItemId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.vibeBoard.unvote({ vibeItemId: "abc" as any })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.vibeBoard.unvote({ vibeItemId: 1 })
    ).rejects.toThrow();
  });
});

describe("vibeBoard.list input validation", () => {
  it("requires a numeric tripId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.vibeBoard.list({ tripId: "abc" as any })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.vibeBoard.list({ tripId: 1 })
    ).rejects.toThrow();
  });
});

// ─── Itinerary ────────────────────────────────────────────────────────────────

describe("itinerary.addDay input validation", () => {
  it("requires a date string", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.itinerary.addDay({ tripId: 1, date: "" })
    ).rejects.toThrow();
  });

  it("accepts valid input without crashing on validation", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      await caller.itinerary.addDay({ tripId: 999999, date: "2025-08-01", title: "Day 1" });
    } catch (e: any) {
      expect(e.message).not.toMatch(/too_small|invalid_type/);
    }
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.itinerary.addDay({ tripId: 1, date: "2025-08-01" })
    ).rejects.toThrow();
  });
});

describe("itinerary.addItem input validation", () => {
  it("rejects empty title", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.itinerary.addItem({ dayId: 1, tripId: 1, title: "" })
    ).rejects.toThrow();
  });

  it("rejects invalid type enum", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.itinerary.addItem({ dayId: 1, tripId: 1, title: "Lunch", type: "invalid" as any })
    ).rejects.toThrow();
  });

  it("accepts all valid type values without validation errors", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const types = ["activity", "food", "transport", "accommodation", "free", "other"] as const;
    for (const type of types) {
      try {
        await caller.itinerary.addItem({ dayId: 999999, tripId: 999999, title: "Test", type });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.itinerary.addItem({ dayId: 1, tripId: 1, title: "Test" })
    ).rejects.toThrow();
  });
});

describe("itinerary.getDays input validation", () => {
  it("requires a numeric tripId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.itinerary.getDays({ tripId: "abc" as any })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.itinerary.getDays({ tripId: 1 })
    ).rejects.toThrow();
  });
});

// ─── Preferences ─────────────────────────────────────────────────────────────

describe("preferences.getMy input validation", () => {
  it("requires a numeric tripId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.preferences.getMy({ tripId: "abc" as any })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.preferences.getMy({ tripId: 1 })
    ).rejects.toThrow();
  });
});

describe("preferences.save input validation", () => {
  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.preferences.save({ tripId: 1, mustHaves: "", strongPreferences: "", avoids: "", openComments: "" })
    ).rejects.toThrow();
  });

  it("rejects a text field exceeding 2000 characters", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.preferences.save({
        tripId: 1,
        mustHaves: "x".repeat(2001),
        strongPreferences: "",
        avoids: "",
        openComments: "",
      })
    ).rejects.toThrow();
  });

  it("accepts valid empty-string preferences without crashing on validation", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      await caller.preferences.save({ tripId: 999999, mustHaves: "", strongPreferences: "", avoids: "", openComments: "" });
    } catch (e: any) {
      expect(e.message).not.toMatch(/too_big|invalid_type/);
    }
  });
});

describe("preferences.countForTrip input validation", () => {
  it("requires a numeric tripId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.preferences.countForTrip({ tripId: "abc" as any })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.preferences.countForTrip({ tripId: 1 })
    ).rejects.toThrow();
  });
});

// ─── accommodations.refreshMatch ─────────────────────────────────────────────

describe("accommodations.refreshMatch input validation", () => {
  it("requires numeric accommodationId and tripId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.accommodations.refreshMatch({ accommodationId: "abc" as any, tripId: 1 })
    ).rejects.toThrow();
    await expect(
      caller.accommodations.refreshMatch({ accommodationId: 1, tripId: "abc" as any })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(makeUnauthCtx());
    await expect(
      caller.accommodations.refreshMatch({ accommodationId: 1, tripId: 1 })
    ).rejects.toThrow();
  });
});
