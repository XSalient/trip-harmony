/**
 * One vote per group.
 *
 * This is the epic whose breakage is silent. A family holding two votes looks
 * exactly like a family holding one: the count is plausible, the score is
 * plausible, and the only symptom is that one household quietly carries more
 * weight than the others. So the rules are asserted at the two places they can
 * be got wrong — the write path, and the moment somebody changes group.
 *
 * The suite reads source rather than running SQL, like `locking.test.ts`, and
 * for the same reason: the invariant is "every vote path calls this", which is
 * a property of the code and not of one query.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const routerDir = import.meta.dirname;
const db = readFileSync(join(routerDir, "..", "db.ts"), "utf8");
const router = (f: string) => readFileSync(join(routerDir, f), "utf8");

function dbFunction(name: string): string {
  const start = db.indexOf(`export async function ${name}(`);
  expect(start, `${name} should exist in db.ts`).toBeGreaterThan(-1);
  const next = db.indexOf("\nexport ", start + 1);
  return db.slice(start, next === -1 ? undefined : next);
}

describe("the rule is enforced in exactly one place", () => {
  const body = dbFunction("applyGroupVoteExclusivity");

  it("does nothing at all when the trip votes per member", () => {
    // The default must be inert. A trip that never creates a group has to
    // behave exactly as it did before any of this shipped.
    expect(body).toContain('trip.votingUnit !== "group"');
    expect(body).toContain("return []");
  });

  it("does nothing for a member who is in no group", () => {
    expect(body).toContain("member?.groupId");
  });

  it("removes the groupmates' votes and leaves everyone else's", () => {
    expect(body).toContain("filter(id => id !== userId)");
    expect(body).toContain("inArray(table.userId, others)");
    expect(body).toContain("delete(table)");
    // Scoped to the one proposal — a vote elsewhere is a different decision.
    expect(body).toContain("eq(proposal, proposalId)");
  });

  it("returns who was displaced, so the trail can say it happened", () => {
    expect(body).toContain("return displaced.map");
  });

  it("covers all four vote tables, so no proposal type is exempt", () => {
    const tables = db.slice(db.indexOf("const VOTE_TABLES"));
    for (const kind of ["date", "destination", "accommodation", "budget"])
      expect(tables).toContain(`${kind}:`);
  });
});

describe("every path that writes a vote goes through it", () => {
  const votePaths: Array<[string, number]> = [
    // propose (an implicit vote), vote, clone.
    ["dates.ts", 3],
    ["destinations.ts", 3],
    ["accommodations.ts", 3],
    ["budget.ts", 2],
  ];

  for (const [file, expected] of votePaths) {
    it(`${file} calls it before every upsert`, () => {
      const src = router(file);
      expect(src.split("applyGroupVoteExclusivity(").length - 1).toBe(expected);
    });
  }

  it("no vote is written anywhere else", () => {
    // A second place that writes a vote row without the helper reintroduces
    // double votes on exactly one proposal type, which is the hardest version
    // of this bug to notice.
    const writers = readdirSync(routerDir)
      .filter(f => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .filter(f =>
        /db\.vote(Date|Destination|Accommodation|Budget)/.test(router(f))
      );
    expect(writers.sort()).toEqual([
      "accommodations.ts",
      "budget.ts",
      "dates.ts",
      "destinations.ts",
    ]);
  });
});

describe("moving somebody between groups", () => {
  const body = dbFunction("reconcileGroupVotes");

  it("is run by the move itself, not left for the next vote", () => {
    const groups = router("groups.ts");
    expect(groups).toMatch(
      /assignMember[\s\S]{0,2500}reconcileGroupVotes\(input\.tripId\)/
    );
  });

  it("keeps the most recent vote and drops the older one", () => {
    expect(body).toContain("row.updatedAt ?? row.createdAt");
    expect(body).toContain("at > held.at");
  });

  it("leaves ungrouped members entirely alone", () => {
    expect(body).toContain("if (groupId == null) continue");
  });

  it("sweeps every proposal type on the trip, not just the one just voted on", () => {
    for (const kind of ["date", "destination", "accommodation", "budget"])
      expect(body).toContain(`"${kind}"`);
  });

  it("reports what it dropped, so it can reach the activity trail", () => {
    expect(body).toContain("dropped.push");
    expect(router("groups.ts")).toContain('action: "vote.superseded"');
  });

  it("does nothing on a trip that votes per member", () => {
    expect(body).toContain('trip.votingUnit !== "group"');
  });
});

describe("switching a live trip to group voting", () => {
  it("does not delete anybody's existing vote", () => {
    const body = router("groups.ts");
    const proc = body.slice(body.indexOf("setVotingUnit:"));
    expect(proc.slice(0, proc.indexOf("setGroupBudget:"))).not.toContain(
      "reconcileGroupVotes"
    );
  });
});

describe("the denominator", () => {
  const body = dbFunction("getTripVoterCount");

  it("counts groups plus ungrouped tripmates in group mode", () => {
    expect(body).toContain("groups.size");
    expect(body).toContain("m.groupId == null");
  });

  it("never counts a watcher, in either mode", () => {
    // A watcher in the denominator makes "3/4 voted" unreachable forever.
    expect(body).toContain('m.role !== "watcher"');
  });

  it("is served to the client rather than re-derived by it", () => {
    expect(router("trips.ts")).toContain(
      "voterCount: await db.getTripVoterCount"
    );
    const pages = join(routerDir, "..", "..", "client", "src", "pages");
    for (const page of [
      "TripDates.tsx",
      "TripDestinations.tsx",
      "TripAccommodations.tsx",
      "TripBudget.tsx",
    ]) {
      const src = readFileSync(join(pages, page), "utf8");
      expect(src).toContain("voterCount");
      // Two derivations of one number is how one screen says "2/4" while the
      // next says "2/3".
      expect(src).not.toContain("const memberCount = useMemo");
    }
  });
});
