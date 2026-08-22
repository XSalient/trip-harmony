/**
 * Groups, attendees and headcount — the rules that are invisible when broken.
 *
 * Three of them in particular:
 *
 * - **A pet in `people`.** Every per-person figure derived from headcount would
 *   be quietly too low, and no screen would look wrong.
 * - **A watcher seeing an age.** An age is the most personal field on the
 *   members page. The audit that missed `budget.summary` in E2 was done per
 *   router file; this one is done on the payload.
 * - **Deleting a group deleting people.** It removes an organisational label,
 *   never a member and never an attendee.
 *
 * No database here, as everywhere else in this suite: the projections and the
 * headcount reducer are pure over rows, so they are tested over rows.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { canSeeMemberDetails } from "../../shared/roles.js";
import { projectMembersForRole } from "./_shared.js";

const source = (file: string) =>
  readFileSync(join(import.meta.dirname, file), "utf8");

/** The body of a top-level exported function in `db.ts`. */
function dbFunction(name: string): string {
  const db = readFileSync(join(import.meta.dirname, "..", "db.ts"), "utf8");
  const start = db.indexOf(`export async function ${name}(`);
  expect(start, `${name} should exist in db.ts`).toBeGreaterThan(-1);
  const next = db.indexOf("\nexport ", start + 1);
  return db.slice(start, next === -1 ? undefined : next);
}

describe("what a watcher is handed", () => {
  const members = [
    {
      id: 1,
      tripId: 7,
      userId: 42,
      role: "tripmate" as const,
      status: "accepted",
      groupId: 3,
      budgetMax: "1200.00",
      invitedByName: "Ada",
      user: { id: 42, name: "Priya", email: "priya@example.com" },
    },
  ];

  it("keeps the grouping — a trip of families is shaped that way for everyone", () => {
    const [seen] = projectMembersForRole(members, "watcher");
    expect(seen.groupId).toBe(3);
    expect(seen.user?.name).toBe("Priya");
  });

  it("strips the email, the cap and who invited whom", () => {
    const [seen] = projectMembersForRole(members, "watcher") as any[];
    expect(seen.user.email).toBeUndefined();
    expect(seen.budgetMax).toBeUndefined();
    expect(seen.invitedByName).toBeUndefined();
  });

  it("hands a tripmate everything, unchanged", () => {
    expect(projectMembersForRole(members, "tripmate")).toEqual(members);
    expect(canSeeMemberDetails("tripmate")).toBe(true);
  });

  it("blanks every attendee age, and only for a watcher", () => {
    const groups = source("groups.ts");
    // The projection is applied in the router, before the payload leaves the
    // process — not in the page, which has already received it by then.
    expect(groups).toContain("function projectAttendeesForRole");
    expect(groups).toContain("age: null");
    expect(groups).toMatch(/attendees:[\s\S]{0,400}projectAttendeesForRole/);
    expect(groups).toMatch(/list:[\s\S]{0,300}projectGroupsForRole/);
  });

  it("strips a group's cap as well as a member's — one wallet, same rule", () => {
    const groups = source("groups.ts");
    expect(groups).toContain("function projectGroupsForRole");
    expect(groups).toMatch(/projectGroupsForRole[\s\S]{0,400}budgetMax: null/);
  });
});

describe("deleting a group", () => {
  const body = dbFunction("deleteTripGroup");

  it("clears the label off its members rather than deleting them", () => {
    expect(body).toContain("update(tripMembers)");
    expect(body).toContain("groupId: null");
    expect(body).not.toContain("delete(tripMembers)");
  });

  it("leaves its attendees on the trip, ungrouped", () => {
    expect(body).toContain("update(tripAttendees)");
    expect(body).not.toContain("delete(tripAttendees)");
  });
});

describe("headcount", () => {
  const body = dbFunction("getTripHeadcount");

  it("counts adults and children as people, and never a pet", () => {
    expect(body).toContain("acc.people = acc.adults + acc.children");
    // If a pet ever reached `people`, it would reach every divisor derived
    // from it — and nothing on any screen would show it.
    expect(body).not.toMatch(/people\s*=\s*[^\n]*pets/);
  });

  it("counts a group as a charging unit only when somebody is in it", () => {
    expect(body).toContain("populated");
    expect(body).toContain("ungrouped");
  });

  it("is the only place a headcount is computed", () => {
    const db = readFileSync(join(import.meta.dirname, "..", "db.ts"), "utf8");
    expect(db.split("adults++").length - 1).toBe(1);
  });
});

describe("a member's own attendee row", () => {
  it("is written when they accept, so headcount is one number", () => {
    const trips = source("trips.ts");
    expect(trips).toContain("upsertMemberAttendee");
    // create, clone and join.
    expect(trips.split("upsertMemberAttendee").length - 1).toBe(3);
  });

  it("goes when they are removed, or they stay in every per-person figure", () => {
    const trips = source("trips.ts");
    expect(trips).toMatch(
      /removeTripMember\([\s\S]{0,400}deleteMemberAttendee\(/
    );
  });

  it("cannot be deleted on its own, which would drop them from the count", () => {
    const groups = source("groups.ts");
    expect(groups).toMatch(
      /removeAttendee[\s\S]{0,900}memberUserId != null[\s\S]{0,200}BAD_REQUEST/
    );
  });

  it("is upserted rather than inserted, so re-accepting counts once", () => {
    const body = dbFunction("upsertMemberAttendee");
    expect(body).toContain("if (existing)");
  });
});

describe("a pet has no age", () => {
  it("is enforced on the server, not only by hiding the field", () => {
    const groups = source("groups.ts");
    expect(groups).toContain('input.kind === "pet" ? null');
    expect(groups).toContain('kind === "pet" ? null');
  });
});

describe("group names", () => {
  it("clash case-insensitively, and say so rather than failing at the index", () => {
    const groups = source("groups.ts");
    expect(groups).toContain("findTripGroupByName");
    expect(groups).toContain('code: "CONFLICT"');
    expect(dbFunction("findTripGroupByName")).toContain("lower(");
  });
});
