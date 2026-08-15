/**
 * The referee endpoint: who may ask, how often, and what it says when the
 * model does not answer.
 *
 * The database and the model are both stubbed, so these run in CI with no
 * Postgres, no AI key and no network — and they assert the two things that
 * used to be invisible: that a failed model call is reported as a failure, and
 * that the trip's own facts are what gets sent.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../_core/context.js";

const h = vi.hoisted(() => {
  // Set before `env.ts` is imported: it parses `process.env` once, at load.
  process.env.AI_ENABLED = "true";
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY = "test-key-not-a-secret";
  return {
    invokeLLM: vi.fn(),
    db: {
      getTripMember: vi.fn(),
      getRefereeMessages: vi.fn(),
      recordActivity: vi.fn(),
      getTrip: vi.fn(),
      getTripMembers: vi.fn(),
      getAllTripPreferences: vi.fn(),
      getBudgetItems: vi.fn(),
      getDateProposals: vi.fn(),
      getDestinations: vi.fn(),
      getAccommodations: vi.fn(),
      createRefereeMessage: vi.fn(),
    },
  };
});

vi.mock("../_core/llm.js", () => ({ invokeLLM: h.invokeLLM }));
vi.mock("../db.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../db.js")>();
  return { ...actual, ...h.db };
});

const { appRouter } = await import("./index.js");
const { REFEREE_PROMPT_VERSION } = await import("../prompts/referee.js");
const { REFEREE_COOLDOWN_MS } = await import("../../shared/const.js");

function makeCtx(userId = 1): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `test-user-${userId}`,
      email: `test${userId}@example.com`,
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const caller = () => appRouter.createCaller(makeCtx());
const analyse = () =>
  caller().referee.analyze({ tripId: 1, phase: "accommodation" });

const modelSaid = (text: string) => ({
  choices: [{ index: 0, message: { role: "assistant", content: text } }],
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AI_ENABLED = "true";
  h.db.getTripMember.mockResolvedValue({
    tripId: 1,
    userId: 1,
    role: "admin",
    status: "accepted",
  });
  h.db.getRefereeMessages.mockResolvedValue([]);
  h.db.recordActivity.mockResolvedValue(undefined);
  h.db.getTrip.mockResolvedValue({
    id: 1,
    name: "Amsterdam in May",
    currency: "EUR",
    totalBudget: null,
  });
  h.db.getTripMembers.mockResolvedValue([
    {
      userId: 1,
      status: "accepted",
      budgetMax: "800.00",
      user: { name: "Sam" },
    },
    { userId: 2, status: "accepted", budgetMax: null, user: { name: "Priya" } },
  ]);
  h.db.getAllTripPreferences.mockResolvedValue([
    {
      userId: 1,
      rawText: JSON.stringify({
        mustHaves: "Three bathrooms",
        strongPreferences: "",
        avoids: "",
        openComments: "",
      }),
    },
  ]);
  h.db.getBudgetItems.mockResolvedValue([]);
  h.db.getDateProposals.mockResolvedValue([]);
  h.db.getDestinations.mockResolvedValue([]);
  h.db.getAccommodations.mockResolvedValue([
    {
      name: "Grand Hotel Amrâth",
      location: "Amsterdam, Netherlands",
      totalPrice: "1600.00",
      matchAnalysis: JSON.stringify({
        groupFitScore: 42,
        resentmentRisk: "high",
        summary: "Fails a stated must-have.",
        flags: [
          "Failed must-have: standard hotel rooms do not provide 3 bathrooms",
        ],
        memberMatches: [{ name: "Sam", score: 20, verdict: "❌ Poor match" }],
      }),
      votes: [{ userId: 1, vote: "yes" }],
    },
  ]);
  h.db.createRefereeMessage.mockResolvedValue(99);
  h.invokeLLM.mockResolvedValue(modelSaid("**What I can see** — two members."));
});

describe("who may ask", () => {
  it("refuses a tripmate, before it reads anything about the trip", async () => {
    h.db.getTripMember.mockResolvedValue({
      tripId: 1,
      userId: 1,
      role: "tripmate",
      status: "accepted",
    });
    await expect(analyse()).rejects.toThrow(/admin/i);
    expect(h.invokeLLM).not.toHaveBeenCalled();
    expect(h.db.getAccommodations).not.toHaveBeenCalled();
  });

  it("refuses someone who is not a member at all", async () => {
    h.db.getTripMember.mockResolvedValue(null);
    await expect(analyse()).rejects.toThrow(/not a member/i);
    expect(h.invokeLLM).not.toHaveBeenCalled();
  });
});

describe("the cooldown", () => {
  it("hands back the last read instead of calling the model again", async () => {
    h.db.getRefereeMessages.mockResolvedValue([
      {
        id: 7,
        content: "An earlier read.",
        createdAt: new Date(Date.now() - 60_000),
      },
    ]);

    const result = await analyse();

    expect(result).toMatchObject({
      id: 7,
      content: "An earlier read.",
      fromCooldown: true,
      analysisUnavailable: false,
    });
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(h.invokeLLM).not.toHaveBeenCalled();
    expect(h.db.createRefereeMessage).not.toHaveBeenCalled();
  });

  it("runs again once the window has passed", async () => {
    h.db.getRefereeMessages.mockResolvedValue([
      {
        id: 7,
        content: "An earlier read.",
        createdAt: new Date(Date.now() - REFEREE_COOLDOWN_MS - 1_000),
      },
    ]);

    const result = await analyse();

    expect(result.fromCooldown).toBe(false);
    expect(h.invokeLLM).toHaveBeenCalledTimes(1);
  });
});

describe("a run that worked", () => {
  it("stores what the model said, with the prompt version beside it", async () => {
    const result = await analyse();

    expect(result).toMatchObject({
      id: 99,
      content: "**What I can see** — two members.",
      fromCooldown: false,
      analysisUnavailable: false,
      retryAfterMs: REFEREE_COOLDOWN_MS,
    });

    const stored = h.db.createRefereeMessage.mock.calls[0][0];
    expect(stored.messageType).toBe("mediation");
    expect(stored.tripId).toBe(1);
    const context = JSON.parse(stored.context);
    expect(context.promptVersion).toBe(REFEREE_PROMPT_VERSION);
  });

  it("shows the referee what the accommodations screen already found", async () => {
    // The complaint this fixes: a stay scored 42/100 with a failed must-have
    // on one screen, while the referee — which had only ever seen vote
    // tallies — reported nothing wrong.
    await analyse();

    const context = JSON.parse(
      h.db.createRefereeMessage.mock.calls[0][0].context
    );
    const stay = context.accommodations[0];
    expect(stay.matchAnalysis.groupFitScore).toBe(42);
    expect(stay.matchAnalysis.resentmentRisk).toBe("high");
    expect(stay.perPersonShare).toBe(800);
    expect(context.preferences[0].mustHaves).toBe("Three bathrooms");
    expect(context.membersWithoutPreferences).toEqual(["Priya"]);
  });

  it("sends the versioned prompt, not an inline one", async () => {
    await analyse();

    const [{ messages }] = h.invokeLLM.mock.calls[0];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("MUST-HAVES ARE CONSTRAINTS");
    expect(messages[1].content).toContain("Three bathrooms");
    expect(messages[1].content).toContain(
      '"promptVersion":"' + REFEREE_PROMPT_VERSION + '"'
    );
  });

  it("records that a person asked for it", async () => {
    await analyse();
    expect(h.db.recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai.referee_run", tripId: 1 })
    );
  });
});

describe("a run the model could not answer", () => {
  it("says so, and does not store an analysis", async () => {
    h.invokeLLM.mockRejectedValue(new Error("503 model overloaded"));

    const result = await analyse();

    expect(result.analysisUnavailable).toBe(true);
    expect(result.content).toContain("Analysis unavailable");
    expect(result.content).toContain("I have not read this trip");
    expect(result.content).not.toMatch(/momentum|every vote counts/i);
    expect(h.db.createRefereeMessage).not.toHaveBeenCalled();
  });

  it("leaves the button usable, so an outage is not a ten-minute lockout", async () => {
    h.invokeLLM.mockRejectedValue(new Error("503 model overloaded"));
    const result = await analyse();
    expect(result.retryAfterMs).toBe(0);
    expect(result.fromCooldown).toBe(false);
  });

  it("treats an empty completion as a failure, not as a blank analysis", async () => {
    h.invokeLLM.mockResolvedValue(modelSaid("   "));

    const result = await analyse();

    expect(result.analysisUnavailable).toBe(true);
    expect(h.db.createRefereeMessage).not.toHaveBeenCalled();
  });
});

describe("a deployment with no AI provider", () => {
  it("says that, and spends nothing finding out", async () => {
    process.env.AI_ENABLED = "false";

    const result = await analyse();

    expect(result.analysisUnavailable).toBe(true);
    expect(result.content).toContain("no AI provider configured");
    expect(h.invokeLLM).not.toHaveBeenCalled();
    expect(h.db.getAccommodations).not.toHaveBeenCalled();
    // Nothing happened, so nothing is recorded as having happened.
    expect(h.db.recordActivity).not.toHaveBeenCalled();
    expect(h.db.createRefereeMessage).not.toHaveBeenCalled();
  });

  it("still shows the last read if one is inside the cooldown", async () => {
    process.env.AI_ENABLED = "false";
    h.db.getRefereeMessages.mockResolvedValue([
      {
        id: 7,
        content: "An earlier read.",
        createdAt: new Date(Date.now() - 60_000),
      },
    ]);

    const result = await analyse();

    expect(result.fromCooldown).toBe(true);
    expect(result.content).toBe("An earlier read.");
  });
});
