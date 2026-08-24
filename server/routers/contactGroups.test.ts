/**
 * Adding a saved family to a trip, and what it is allowed to disturb.
 *
 * Two failures this exists to prevent, both silent:
 *
 * - **A preview that lies.** The confirmation names who is about to be moved
 *   out of somebody else's family. Computed by different code from the action
 *   it previews, it would eventually describe something else — so the plan is
 *   one function, run twice, and asserted here on fixtures.
 * - **A preview that writes.** "Show me what this would do" that quietly
 *   creates a group and sends five emails is worse than no preview at all.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planImport } from "./contacts.js";

const source = readFileSync(join(import.meta.dirname, "contacts.ts"), "utf8");

const starts = [...source.matchAll(/^ {2}(\w+): protectedProcedure/gm)];
function procedure(name: string): string {
  const i = starts.findIndex(m => m[1] === name);
  expect(i, `${name} should exist in contacts.ts`).toBeGreaterThan(-1);
  return source.slice(starts[i].index!, starts[i + 1]?.index ?? source.length);
}

/** The Patels as somebody saved them: two adults, a child and the dog. */
const saved = [
  {
    id: 1,
    name: "Sam Patel",
    email: "sam@example.com",
    contactId: 10,
    kind: "adult" as const,
    age: null,
  },
  {
    id: 2,
    name: "Ana Patel",
    email: "ana@example.com",
    contactId: 11,
    kind: "adult" as const,
    age: null,
  },
  {
    id: 3,
    name: "Kiran",
    email: null,
    contactId: null,
    kind: "child" as const,
    age: 7,
  },
  {
    id: 4,
    name: "Rufus",
    email: null,
    contactId: null,
    kind: "pet" as const,
    age: null,
  },
];

const member = (
  userId: number,
  email: string,
  groupId: number | null,
  status = "accepted"
) => ({
  userId,
  status,
  groupId,
  user: { name: `User ${userId}`, email },
});

describe("planImport", () => {
  it("names somebody already on the trip in another family as a conflict", () => {
    const plan = planImport(saved, [member(5, "sam@example.com", 20)], 30);
    expect(plan.conflicts).toEqual([
      { userId: 5, name: "User 5", currentGroupId: 20 },
    ]);
    expect(plan.willMove).toEqual([]);
  });

  it("moves somebody who is on the trip in no group without asking", () => {
    // Nothing is being taken away from them, so there is nothing to confirm.
    const plan = planImport(saved, [member(5, "sam@example.com", null)], 30);
    expect(plan.conflicts).toEqual([]);
    expect(plan.willMove).toEqual([{ userId: 5, name: "User 5" }]);
  });

  it("leaves somebody already in the target group alone", () => {
    const plan = planImport(saved, [member(5, "sam@example.com", 30)], 30);
    expect(plan.alreadyInThisGroup).toEqual([{ userId: 5, name: "User 5" }]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.willMove).toEqual([]);
  });

  it("invites the people who are not on the trip", () => {
    const plan = planImport(saved, [], null);
    expect(plan.willInvite).toEqual([
      { name: "Sam Patel", email: "sam@example.com" },
      { name: "Ana Patel", email: "ana@example.com" },
    ]);
  });

  it("makes attendees of the people who have no address", () => {
    // A child and a dog get no login, no vote and no email — they are counted
    // and nothing else.
    const plan = planImport(saved, [], null);
    expect(plan.willAddAttendees.map(a => a.name)).toEqual(["Kiran", "Rufus"]);
    expect(plan.willInvite.map(i => i.name)).not.toContain("Kiran");
  });

  it("matches addresses case-insensitively", () => {
    const plan = planImport(saved, [member(5, "SAM@Example.com ", 20)], 30);
    expect(plan.conflicts).toHaveLength(1);
  });

  it("ignores a membership that was never accepted", () => {
    // Somebody invited and still deciding is not on the trip, so importing
    // them is an invite, not a move.
    const plan = planImport(
      saved,
      [member(5, "sam@example.com", 20, "pending")],
      30
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.willInvite.map(i => i.email)).toContain("sam@example.com");
  });

  it("treats a trip with no groups at all as nothing to conflict with", () => {
    const plan = planImport(saved, [member(5, "sam@example.com", null)], null);
    expect(plan.conflicts).toEqual([]);
    expect(plan.willMove).toHaveLength(1);
  });
});

describe("importGroupToTrip", () => {
  const body = procedure("importGroupToTrip");

  it("writes nothing at all when it is only previewing", () => {
    const preview = body.indexOf("if (!input.confirm)");
    expect(preview).toBeGreaterThan(-1);
    const before = body.slice(0, preview);
    for (const write of [
      "createTripGroup(",
      "setMemberGroup(",
      "createTripAttendee(",
      "sendInvite(",
      "reconcileGroupVotes(",
    ])
      expect(
        before,
        `${write} must not run before the confirmation`
      ).not.toContain(write);
  });

  it("previews and acts from the same plan", () => {
    expect(body).toContain("planImport(");
    expect(body.match(/planImport\(/g)).toHaveLength(1);
  });

  it("keeps the invite rule that inviting a voter is an admin's job", () => {
    expect(body).toContain(
      'requireTripRole(input.tripId, ctx.user.id, "tripmate")'
    );
    expect(body).toContain('input.role !== "watcher"');
    expect(body).toContain(
      'requireTripRole(input.tripId, ctx.user.id, "admin")'
    );
  });

  it("reconciles votes once, not once per person moved", () => {
    expect(body.match(/reconcileGroupVotes\(/g)).toHaveLength(1);
    expect(body).toContain('action: "vote.superseded"');
    // And says so, or the conflict flow destroys votes quietly.
    expect(body).toContain("votesSuperseded");
  });

  it("goes through the shared invite helper rather than its own", () => {
    expect(body).toContain("sendInvite({");
    expect(body).toContain("throwOnFailure: false");
  });
});

describe("saveGroupFromTrip", () => {
  const body = procedure("saveGroupFromTrip");

  it("is closed to watchers, who are never shown member addresses", () => {
    expect(body).toContain(
      'requireTripRole(input.tripId, ctx.user.id, "tripmate")'
    );
  });

  it("appends to an existing saved family rather than making a second", () => {
    expect(body).toContain("findContactGroupByName(");
    expect(body).toContain("addContactGroupMembers(");
  });

  it("does not save the same person twice through their attendee row", () => {
    expect(body).toContain("a.memberUserId != null");
  });

  it("takes addresses from the membership, never from the caller", () => {
    expect(body).toContain("m.user?.email");
    expect(body).not.toContain("input.email");
  });
});
