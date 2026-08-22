/**
 * Who may invite, and to what.
 *
 * `sendInviteEmail` was admin-only, which meant a tripmate could not add their
 * own mother to a trip of families — the person who knows who is in a household
 * had to ask somebody else to record it. It is now two checks rather than one,
 * and the pair is the whole rule:
 *
 *   tripmate  → may invite a **watcher**
 *   admin     → may invite anyone
 *
 * The loosening is only safe because of what a watcher is. If a watcher ever
 * gains a vote, or is ever counted in a denominator, this becomes a way for a
 * tripmate to change the arithmetic of every decision on the trip without an
 * admin — so the properties that make it safe are asserted here too, beside the
 * rule that depends on them, rather than left to the epic that introduced them.
 *
 * Source-read like `locking.test.ts`: the rule is the shape of the procedure,
 * not the result of one query.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const routerDir = import.meta.dirname;
const trips = readFileSync(join(routerDir, "trips.ts"), "utf8");
const db = readFileSync(join(routerDir, "..", "db.ts"), "utf8");

/** The body of one procedure in `trips.ts`. */
function procedure(name: string): string {
  const start = trips.indexOf(`  ${name}: protectedProcedure`);
  expect(start, `${name} should exist in trips.ts`).toBeGreaterThan(-1);
  const next = trips.indexOf("\n  }),", start);
  return trips.slice(start, next === -1 ? undefined : next);
}

function dbFunction(name: string): string {
  const start = db.indexOf(`export async function ${name}(`);
  expect(start, `${name} should exist in db.ts`).toBeGreaterThan(-1);
  const next = db.indexOf("\nexport ", start + 1);
  return db.slice(start, next === -1 ? undefined : next);
}

describe("a tripmate may invite a watcher", () => {
  const body = procedure("sendInviteEmail");

  it("demands at least a tripmate, so a watcher is still refused", () => {
    expect(body).toContain(
      'requireTripRole(input.tripId, ctx.user.id, "tripmate")'
    );
  });

  it("demands an admin for any role that is not watcher", () => {
    expect(body).toContain('input.role !== "watcher"');
    expect(body).toMatch(
      /input\.role !== "watcher"[\s\S]{0,120}requireTripRole\([^)]*"admin"/
    );
  });

  it("checks the role before it writes the invite or sends anything", () => {
    // An invite row written before the check is a record of something that was
    // not allowed, and an email sent before it cannot be recalled.
    const tripmateCheck = body.indexOf('"tripmate"');
    const adminCheck = body.indexOf('"admin"');
    const write = body.indexOf("upsertTripInvite");
    const send = body.indexOf("sendTripInviteEmail");
    expect(tripmateCheck).toBeGreaterThan(-1);
    expect(adminCheck).toBeLessThan(write);
    expect(adminCheck).toBeLessThan(send);
  });
});

describe("what makes that safe", () => {
  it("a watcher is in no vote denominator", () => {
    expect(dbFunction("getTripVoterCount")).toContain('m.role !== "watcher"');
  });

  it("a watcher is never listed as somebody still to vote", () => {
    expect(dbFunction("getProposalVoters")).toContain('m.role !== "watcher"');
  });

  it("a watcher cannot vote, propose, comment or finalise", () => {
    // Every one of those goes through `requireTripRole(..., "tripmate")` or
    // stricter; `roleCoverage.test.ts` sweeps that across the whole API. Here
    // it is enough that the role ordering still puts a watcher below a
    // tripmate, which is what that sweep relies on.
    const roles = readFileSync(
      join(routerDir, "..", "..", "shared", "roles.ts"),
      "utf8"
    );
    expect(roles).toMatch(/watcher:\s*0/);
    expect(roles).toMatch(/tripmate:\s*1/);
  });

  it("a watcher still counts as somebody who is coming", () => {
    // The point of inviting them: they are on the trip and in the headcount,
    // which is what the accommodation and budget maths divide by.
    expect(trips).toContain("upsertMemberAttendee");
    expect(dbFunction("upsertMemberAttendee")).not.toContain("watcher");
  });
});

describe("the shared invite link stays admin-only", () => {
  it("still makes tripmates, so it is not a tripmate's to hand out", () => {
    expect(procedure("join")).toContain(
      'let role: "watcher" | "tripmate" | "admin" = "tripmate"'
    );
    const members = readFileSync(
      join(routerDir, "..", "..", "client", "src", "pages", "TripMembers.tsx"),
      "utf8"
    );
    // The invite form opened up to tripmates; the link card did not.
    expect(members).toMatch(/\{isAdmin && \([\s\S]{0,800}inviteUrl/);
  });

  it("the client cannot post a role a tripmate is not allowed", () => {
    const members = readFileSync(
      join(routerDir, "..", "..", "client", "src", "pages", "TripMembers.tsx"),
      "utf8"
    );
    expect(members).toContain('isAdmin ? inviteRole : "watcher"');
  });
});
