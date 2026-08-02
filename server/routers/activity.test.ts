/**
 * The activity trail, and the vote-time bug it exposed.
 *
 * Per the owner's decision there is no activity feed: the table records
 * everything, and only a little of it reaches a screen. So the things worth
 * asserting are that the recording is wired in and cannot break a user's
 * action, and that a changed vote reports when it *changed*.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACTIVITY_ACTIONS } from "../db.js";
import { projectProposalForRole } from "./_shared.js";

const here = import.meta.dirname;
const dbSource = readFileSync(join(here, "..", "db.ts"), "utf8");
const read = (f: string) => readFileSync(join(here, f), "utf8");

describe("vote timestamps", () => {
  it("sets updatedAt when a vote is changed, in all three vote helpers", () => {
    // The bug was that the update branch set only `vote`, so a changed vote
    // still reported the moment of the first one. Adding the column without
    // this line would have fixed nothing.
    for (const fn of [
      "voteDateProposal",
      "voteDestination",
      "voteAccommodation",
    ]) {
      const start = dbSource.indexOf(`export async function ${fn}(`);
      expect(start, `${fn} should exist`).toBeGreaterThan(-1);
      const body = dbSource.slice(
        start,
        dbSource.indexOf("\nexport ", start + 1)
      );
      expect(body).toContain("updatedAt: new Date()");
    }
  });

  it("reports the changed time, not the created time, to the breakdown", () => {
    const start = dbSource.indexOf("export async function getProposalVoters(");
    const body = dbSource.slice(
      start,
      dbSource.indexOf("\nexport ", start + 1)
    );
    // `updatedAt ?? createdAt` — the fallback covers rows written before the
    // column existed.
    expect(body).toContain("r.updatedAt ?? r.createdAt");
  });
});

describe("action vocabulary", () => {
  it("is defined once and covers each entity's lifecycle", () => {
    for (const action of [
      "proposal.created",
      "proposal.locked",
      "proposal.unlocked",
      "vote.cast",
      "vote.changed",
      "vote.withdrawn",
      "member.joined",
      "member.role_changed",
      "ai.match_refreshed",
      "ai.referee_run",
    ]) {
      expect(ACTIVITY_ACTIONS).toContain(action);
    }
  });

  it("uses <entity>.<verb> throughout, so the set stays greppable", () => {
    for (const action of ACTIVITY_ACTIONS) {
      expect(action).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });
});

describe("recording never breaks the caller's action", () => {
  it("swallows and logs rather than throwing", () => {
    const start = dbSource.indexOf("export async function recordActivity(");
    const body = dbSource.slice(
      start,
      dbSource.indexOf("\nexport ", start + 1)
    );
    expect(body).toContain("try {");
    expect(body).toContain("log.warn");
    // No `throw` anywhere in it.
    expect(body).not.toContain("throw");
  });
});

describe("the trail is actually wired in", () => {
  const cases: Array<[string, string[]]> = [
    ["dates.ts", ["proposal.created", "vote.cast", "proposal.locked"]],
    ["destinations.ts", ["proposal.created", "vote.cast", "proposal.locked"]],
    ["accommodations.ts", ["proposal.created", "ai.match_refreshed"]],
    ["comments.ts", ["comment.added", "comment.deleted"]],
    ["trips.ts", ["member.joined", "member.role_changed", "trip.edited"]],
    ["referee.ts", ["ai.referee_run"]],
    ["preferences.ts", ["preferences.saved"]],
  ];

  for (const [file, actions] of cases) {
    it(`${file} records ${actions.join(", ")}`, () => {
      const src = read(file);
      for (const a of actions) expect(src).toContain(`"${a}"`);
    });
  }

  it("picks vote.changed over vote.cast by checking for an existing vote", () => {
    for (const file of ["dates.ts", "destinations.ts", "accommodations.ts"]) {
      expect(read(file)).toContain('had ? "vote.changed" : "vote.cast"');
    }
  });
});

describe("attribution is still a member detail", () => {
  const proposal = {
    id: 1,
    name: "Girona",
    selected: false,
    proposedBy: 42,
    proposer: { id: 42, name: "Ada" },
    createdAt: new Date("2026-08-01"),
    votes: [{ id: 1, userId: 42, vote: "love" }],
  };

  it("gives tripmates the proposer", () => {
    const seen: any = projectProposalForRole(proposal, "tripmate");
    expect(seen.proposer.name).toBe("Ada");
  });

  it("hides the proposer from a watcher, name included", () => {
    const seen: any = projectProposalForRole(proposal, "watcher");
    expect(seen).not.toHaveProperty("proposer");
    expect(seen).not.toHaveProperty("proposedBy");
    expect(JSON.stringify(seen)).not.toContain("Ada");
  });
});
