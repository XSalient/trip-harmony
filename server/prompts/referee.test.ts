/**
 * What the referee is shown, and what it is told to do with it.
 *
 * No model, no database, no clock. `buildRefereeContext` is a pure function
 * over rows, so the four situations the referee exists for — a must-have
 * nothing satisfies, a stay nobody can afford, a group who never filled the
 * preference form in, and a proposal nobody has voted on — are asserted here
 * directly, rather than by reading a generated paragraph and hoping.
 *
 * The arithmetic assertions matter as much as the wording ones. Every number
 * the referee quotes is divided here; a model that has to work out a
 * per-person share from a total and compare it to three caps will eventually
 * get one wrong, and state it with complete confidence.
 */
import { describe, expect, it } from "vitest";
import {
  REFEREE_PROMPT_VERSION,
  buildRefereeContext,
  buildRefereePrompt,
  refereeUnavailableMessage,
  type RefereeInput,
} from "./referee.js";

const member = (
  userId: number,
  name: string,
  extra: { budgetMax?: string; status?: string } = {}
) => ({
  userId,
  status: extra.status ?? "accepted",
  budgetMax: extra.budgetMax ?? null,
  user: { name },
});

const prefs = (userId: number, fields: Record<string, string>) => ({
  userId,
  rawText: JSON.stringify({
    mustHaves: "",
    strongPreferences: "",
    avoids: "",
    openComments: "",
    ...fields,
  }),
});

const votes = (...pairs: Array<[number, string]>) =>
  pairs.map(([userId, vote]) => ({ userId, vote }));

function input(over: Partial<RefereeInput> = {}): RefereeInput {
  return {
    trip: { name: "Amsterdam in May", currency: "EUR", totalBudget: null },
    phase: "accommodation",
    members: [],
    preferences: [],
    budgetItems: [],
    dateProposals: [],
    destinations: [],
    accommodations: [],
    ...over,
  };
}

/** The shape `runAccommodationMatchAnalysis` writes to `accommodations.matchAnalysis`. */
const storedMatchAnalysis = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    groupFitScore: 42,
    comfortScore: 8.5,
    resentmentRisk: "high",
    summary: "Central and comfortable, but it fails a stated must-have.",
    flags: ["Failed must-have: three flights of stairs and no lift"],
    memberMatches: [
      {
        name: "Sam",
        score: 20,
        verdict: "❌ Poor match",
        reason: "Three flights of stairs fails Sam's stated must-have.",
      },
      {
        name: "Priya",
        score: 88,
        verdict: "✅ Great fit",
        reason: "Central, and within Priya's stated budget.",
      },
    ],
    ...over,
  });

describe("an accessibility must-have nothing satisfies", () => {
  const context = buildRefereeContext(
    input({
      members: [member(1, "Sam"), member(2, "Priya"), member(3, "Tom")],
      preferences: [
        prefs(1, { mustHaves: "Ground floor or a lift — I cannot do stairs" }),
        prefs(2, { strongPreferences: "Somewhere central" }),
        prefs(3, { openComments: "Happy with anything" }),
      ],
      accommodations: [
        {
          name: "Casa Escalera",
          location: "Jordaan, Amsterdam",
          totalPrice: "1200",
          matchAnalysis: storedMatchAnalysis(),
          votes: votes([2, "yes"], [3, "yes"]),
        },
      ],
    })
  );

  it("carries the must-have through in the member's own words", () => {
    const sam = context.preferences.find(p => p.name === "Sam");
    expect(sam?.mustHaves).toBe("Ground floor or a lift — I cannot do stairs");
  });

  it("shows the stay's stored match analysis, not just its vote tally", () => {
    const stay = context.accommodations[0];
    // The screen that shows 42/100 and "High risk" and the referee now read
    // the same row. They used to disagree: the referee saw two yes votes and
    // called the group harmonious while the accommodations screen showed a
    // failed must-have on the same stay.
    expect(stay.votes).toEqual({ yes: 2 });
    expect(stay.matchAnalysis?.groupFitScore).toBe(42);
    expect(stay.matchAnalysis?.resentmentRisk).toBe("high");
    expect(stay.matchAnalysis?.flags[0]).toContain("three flights of stairs");
    expect(
      stay.matchAnalysis?.memberMatches.find(m => m.name === "Sam")?.score
    ).toBe(20);
  });

  it("does not report the stay as unanalysed", () => {
    expect(context.dataGaps.join(" ")).not.toContain(
      "never been match-analysed"
    );
  });

  it("puts both the must-have and the flag in front of the model", () => {
    const prompt = buildRefereePrompt(context);
    expect(prompt.user).toContain("I cannot do stairs");
    expect(prompt.user).toContain("three flights of stairs");
  });

  it("tells the model a must-have is a constraint, not a preference", () => {
    const { system } = buildRefereePrompt(context);
    expect(system).toContain("MUST-HAVES ARE CONSTRAINTS, NOT PREFERENCES");
    expect(system).toMatch(/disqualified/i);
    expect(system).toMatch(/never average a failed must-have/i);
  });
});

describe("a stay the group cannot afford", () => {
  const context = buildRefereeContext(
    input({
      members: [
        member(1, "Sam", { budgetMax: "800.00" }),
        member(2, "Priya", { budgetMax: "800.00" }),
        member(3, "Tom"),
      ],
      budgetItems: [{ amount: "600.00" }, { amount: "150.50" }],
      accommodations: [
        {
          name: "Grand Hotel Amrâth",
          totalPrice: "3600.00",
          pricePerNight: "600.00",
          matchAnalysis: storedMatchAnalysis({ flags: [] }),
          votes: votes([1, "yes"], [2, "maybe"], [3, "no"]),
        },
      ],
    })
  );

  it("divides the price here rather than asking the model to", () => {
    const stay = context.accommodations[0];
    expect(stay.totalPrice).toBe(3600);
    expect(stay.perPersonShare).toBe(1200);
  });

  it("names exactly the members whose own cap it breaks", () => {
    // Tom has set no cap. Not knowing whether he can afford it is different
    // from knowing that he can, and the referee is never allowed to guess.
    expect(context.accommodations[0].exceedsBudgetCapFor).toEqual([
      "Sam",
      "Priya",
    ]);
    expect(context.budget.lowestMemberCap).toBe(800);
    expect(context.dataGaps.join(" ")).not.toContain(
      "No member has set a personal budget cap"
    );
  });

  it("totals logged spending without rounding it away", () => {
    expect(context.budget.loggedTotal).toBe(750.5);
    expect(context.budget.loggedPerPerson).toBe(250.17);
    expect(context.budget.currency).toBe("EUR");
  });

  it("tells the model to quote those figures rather than recompute them", () => {
    const { user } = buildRefereePrompt(context);
    expect(user).toContain("do not recompute them");
    expect(user).toContain("exceedsBudgetCapFor");
  });
});

describe("members who have said nothing about what they need", () => {
  it("names them instead of treating silence as agreement", () => {
    const context = buildRefereeContext(
      input({
        members: [member(1, "Sam"), member(2, "Priya"), member(3, "Tom")],
        preferences: [
          prefs(1, { mustHaves: "A kitchen" }),
          // Priya opened the form and saved it empty; Tom never opened it. The
          // referee knows the same amount about both of them: nothing.
          prefs(2, {}),
        ],
      })
    );

    expect(context.preferences.map(p => p.name)).toEqual(["Sam"]);
    expect(context.membersWithoutPreferences).toEqual(["Priya", "Tom"]);
    expect(context.dataGaps).toContain(
      "Priya and Tom have set no trip preferences, so nothing is known about what they need."
    );
  });

  it("says so plainly when nobody has set any", () => {
    const context = buildRefereeContext(
      input({ members: [member(1, "Sam"), member(2, "Priya")] })
    );
    expect(context.dataGaps).toContain(
      "No member has recorded any trip preferences, so nothing is known about what anyone needs."
    );
  });

  it("knows nothing about a member who has not accepted the invitation", () => {
    const context = buildRefereeContext(
      input({
        members: [member(1, "Sam"), member(2, "Priya", { status: "pending" })],
      })
    );
    expect(context.memberCount).toBe(1);
    expect(context.memberNames).toEqual(["Sam"]);
  });

  it("tells the model that a gap is part of the answer", () => {
    const { system, user } = buildRefereePrompt(
      buildRefereeContext(input({ members: [member(1, "Sam")] }))
    );
    expect(system).toContain("NEVER INFER MISSING DATA");
    expect(system).toContain("**What's missing**");
    expect(user).toContain('"dataGaps" is what this trip does not record');
  });
});

describe("a group that has barely voted", () => {
  const context = buildRefereeContext(
    input({
      phase: "destination",
      members: [
        member(1, "Sam"),
        member(2, "Priya"),
        member(3, "Tom"),
        member(4, "Alex"),
      ],
      destinations: [
        { name: "Barcelona", votes: votes([1, "yes"]) },
        { name: "Girona", votes: [] },
      ],
      dateProposals: [{ label: "First week of May" }],
    })
  );

  it("separates a proposal nobody voted on from one the group is split over", () => {
    expect(context.participation.proposalsWithNoVotes).toEqual([
      "First week of May",
      "Girona",
    ]);
    expect(context.dataGaps).toContain(
      "Nobody has voted on: First week of May; Girona."
    );
  });

  it("names who is holding up a proposal that does have votes", () => {
    const barcelona = context.destinations.find(d => d.label === "Barcelona");
    expect(barcelona?.voteCount).toBe(1);
    expect(barcelona?.notVoted).toEqual(["Priya", "Tom", "Alex"]);
  });

  it("names the members who have not voted on anything at all", () => {
    expect(context.participation.membersWhoHaveNotVotedAtAll).toEqual([
      "Priya",
      "Tom",
      "Alex",
    ]);
    expect(context.dataGaps).toContain(
      "Priya, Tom and Alex have not voted on anything yet."
    );
  });
});

describe("the prompt's standing rules", () => {
  const { system } = buildRefereePrompt(
    buildRefereeContext(input({ members: [member(1, "Sam")] }))
  );

  it("asks for observation and recommendation under separate headings", () => {
    for (const heading of [
      "**What I can see**",
      "**Where it's stuck**",
      "**What's missing**",
      "**What I'd suggest**",
      "**Next step**",
    ]) {
      expect(system).toContain(heading);
    }
  });

  it("requires the trade-off behind the recommendation", () => {
    expect(system).toContain("ONE RECOMMENDATION, WITH ITS COST");
    expect(system).toMatch(/what the group gives up, and who is worse off/i);
  });

  it("forbids the referee from claiming it decided anything", () => {
    expect(system).toContain("YOU HAVE DECIDED NOTHING");
    expect(system).toMatch(/You advise\. The group decides\./);
  });

  it("keeps it short", () => {
    expect(system).toMatch(/under 220 words/);
  });

  it("allows nothing that is not in the context", () => {
    expect(system).toContain("FACTS BEFORE OPINION");
    expect(system).toMatch(/Do not invent a proposal, a person, a vote/i);
  });
});

describe("the stored context identifies the prompt that produced it", () => {
  it("carries the version, so an old message can be read as an old prompt", () => {
    const context = buildRefereeContext(input({ members: [member(1, "Sam")] }));
    expect(context.promptVersion).toBe(REFEREE_PROMPT_VERSION);
    expect(JSON.parse(JSON.stringify(context)).promptVersion).toBe(
      REFEREE_PROMPT_VERSION
    );
  });
});

describe("what the referee says when it could not read the trip", () => {
  for (const reason of ["model-error", "no-provider"] as const) {
    const message = refereeUnavailableMessage(reason);

    it(`${reason}: does not pretend the trip was analysed`, () => {
      expect(message).toContain("Analysis unavailable");
      expect(message).toContain("I have not read this trip");
      expect(message).toContain("**not** a trip without conflicts");
    });

    it(`${reason}: keeps none of the old encouraging nudge`, () => {
      // The message this replaced — "Keep the momentum going — every vote
      // counts! 🎯" — was stored as an analysis, so a failed model call and a
      // trip with no conflicts read identically.
      expect(message).not.toMatch(/momentum|every vote counts|🎯/i);
      expect(message).not.toMatch(/harmony|looks good|on track/i);
    });

    it(`${reason}: says nothing was lost`, () => {
      expect(message).toContain("exactly as you left them");
    });
  }

  it("distinguishes an unconfigured deployment from a model that failed", () => {
    expect(refereeUnavailableMessage("no-provider")).toContain(
      "no AI provider configured"
    );
    expect(refereeUnavailableMessage("model-error")).toContain(
      "the model did not answer"
    );
  });
});
