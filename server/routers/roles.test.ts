/**
 * The watcher rules, asserted on the payload rather than on the rendering.
 *
 * A page that declines to display a field has still received it. These tests
 * check what actually leaves the process, which is the only place the rule can
 * be enforced.
 */
import { describe, expect, it } from "vitest";
import {
  hasTripRole,
  canAdminister,
  canContribute,
  canSeeMemberDetails,
  TRIP_ROLE_RANK,
} from "../../shared/roles.js";
import {
  projectProposalForRole,
  projectProposalsForRole,
  projectMembersForRole,
} from "./_shared.js";

const proposal = {
  id: 7,
  tripId: 1,
  name: "Barcelona",
  selected: false,
  proposedBy: 42,
  createdAt: new Date("2026-08-01"),
  // The accommodation screen's AI scoring: a name, a score, and the member's
  // own stated requirement read back at them.
  matchAnalysis: JSON.stringify({
    groupFitScore: 41,
    memberMatches: [
      {
        name: "Ada",
        score: 28,
        reason: "Needs step-free access after surgery",
      },
    ],
  }),
  matchAnalysedAt: new Date("2026-08-02"),
  // A second spelling of the proposer. Two spellings of one idea is how one
  // screen went on naming proposers to watchers after every other screen
  // had stopped.
  proposedByUser: { id: 42, name: "Ada" },
  votes: [
    { id: 1, userId: 42, vote: "love", createdAt: new Date("2026-08-01") },
    { id: 2, userId: 43, vote: "veto", createdAt: new Date("2026-08-02") },
  ],
};

const members = [
  {
    id: 1,
    tripId: 1,
    userId: 42,
    role: "admin" as const,
    status: "accepted",
    budgetMax: "1200.00",
    invitedBy: null,
    joinedVia: "creator",
    user: { id: 42, name: "Ada", email: "ada@example.com" },
  },
  {
    id: 2,
    tripId: 1,
    userId: 43,
    role: "tripmate" as const,
    status: "accepted",
    budgetMax: "600.00",
    invitedBy: 42,
    joinedVia: "email",
    user: { id: 43, name: "Grace", email: "grace@example.com" },
  },
];

describe("role ordering", () => {
  it("ranks watcher below tripmate below admin", () => {
    expect(TRIP_ROLE_RANK.watcher).toBeLessThan(TRIP_ROLE_RANK.tripmate);
    expect(TRIP_ROLE_RANK.tripmate).toBeLessThan(TRIP_ROLE_RANK.admin);
  });

  it("treats a role as satisfying itself", () => {
    expect(hasTripRole("tripmate", "tripmate")).toBe(true);
    expect(hasTripRole("admin", "admin")).toBe(true);
  });

  it("lets a higher role stand in for a lower one, never the reverse", () => {
    expect(hasTripRole("admin", "tripmate")).toBe(true);
    expect(hasTripRole("tripmate", "watcher")).toBe(true);
    expect(hasTripRole("tripmate", "admin")).toBe(false);
    expect(hasTripRole("watcher", "tripmate")).toBe(false);
  });

  it("only admins administer; only tripmates and up contribute", () => {
    expect(canAdminister("admin")).toBe(true);
    expect(canAdminister("tripmate")).toBe(false);
    expect(canAdminister("watcher")).toBe(false);
    expect(canContribute("tripmate")).toBe(true);
    expect(canContribute("watcher")).toBe(false);
    expect(canSeeMemberDetails("watcher")).toBe(false);
  });
});

describe("projectProposalForRole", () => {
  it("gives admins and tripmates the whole proposal", () => {
    expect(projectProposalForRole(proposal, "admin")).toBe(proposal);
    expect(projectProposalForRole(proposal, "tripmate")).toBe(proposal);
  });

  it("hides who proposed it and when from a watcher", () => {
    const seen = projectProposalForRole(proposal, "watcher");
    expect(seen).not.toHaveProperty("proposedBy");
    expect(seen).not.toHaveProperty("createdAt");
  });

  it("hides vote authorship from a watcher but keeps the count", () => {
    const seen: any = projectProposalForRole(proposal, "watcher");
    expect(seen.votes).toHaveLength(2);
    for (const v of seen.votes) {
      expect(v).not.toHaveProperty("userId");
      expect(v).not.toHaveProperty("createdAt");
    }
    // The tally still works, so a watcher sees that a decision is happening.
    expect(seen.votes.filter((v: any) => v.vote === "veto")).toHaveLength(1);
  });

  it("leaves the proposal's own content alone", () => {
    const seen: any = projectProposalForRole(proposal, "watcher");
    expect(seen.name).toBe("Barcelona");
    expect(seen.id).toBe(7);
  });

  it("carries no member identity anywhere in a watcher's payload", () => {
    const serialised = JSON.stringify(
      projectProposalsForRole([proposal], "watcher")
    );
    expect(serialised).not.toContain("42");
    expect(serialised).not.toContain("43");
  });

  it("hides the AI match analysis from a watcher", () => {
    const seen: any = projectProposalForRole(proposal, "watcher");
    expect(seen).not.toHaveProperty("matchAnalysis");
    expect(seen).not.toHaveProperty("matchAnalysedAt");
    // The per-member breakdown quotes what each member asked for by name — the
    // most personal thing on the screen, and the last field a watcher was
    // still being handed.
    expect(JSON.stringify(seen)).not.toContain("step-free");
  });

  it("hides the proposer under either of its two names", () => {
    const seen: any = projectProposalForRole(proposal, "watcher");
    expect(seen).not.toHaveProperty("proposedBy");
    expect(seen).not.toHaveProperty("proposedByUser");
    expect(JSON.stringify(seen)).not.toContain("Ada");
  });

  it("still gives a tripmate the analysis and the proposer", () => {
    const seen: any = projectProposalForRole(proposal, "tripmate");
    expect(seen.matchAnalysis).toContain("step-free");
    expect(seen.proposedByUser?.name).toBe("Ada");
  });

  it("survives a proposal with no votes yet", () => {
    const seen: any = projectProposalForRole(
      { ...proposal, votes: undefined },
      "watcher"
    );
    expect(seen.votes).toEqual([]);
  });
});

describe("projectMembersForRole", () => {
  it("gives admins and tripmates the full member rows", () => {
    expect(projectMembersForRole(members, "admin")).toBe(members);
    expect(projectMembersForRole(members, "tripmate")).toBe(members);
  });

  it("gives a watcher names and roles and nothing else", () => {
    const seen: any[] = projectMembersForRole(members, "watcher");
    expect(seen).toHaveLength(2);
    expect(seen[0].user.name).toBe("Ada");
    expect(seen[0].role).toBe("admin");
    for (const m of seen) {
      expect(m).not.toHaveProperty("budgetMax");
      expect(m).not.toHaveProperty("invitedBy");
      expect(m).not.toHaveProperty("joinedVia");
      expect(m.user).not.toHaveProperty("email");
    }
  });

  it("leaks no email address anywhere in a watcher's payload", () => {
    const serialised = JSON.stringify(
      projectMembersForRole(members, "watcher")
    );
    expect(serialised).not.toContain("@example.com");
    expect(serialised).not.toContain("1200.00");
  });
});
