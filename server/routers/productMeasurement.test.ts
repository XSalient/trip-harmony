/**
 * Product measurement: that the events are recorded where the action happens,
 * that they carry nothing they should not, and that a caller who is refused the
 * action is not counted as having performed it.
 *
 * The last one matters more than it looks. If an event were recorded before its
 * role check, every "active participation" figure would include people the app
 * turned away — so each boundary test asserts both the rejection *and* that
 * nothing reached the recorder.
 *
 * The database and the mailer are stubbed throughout: these run with no
 * Postgres, no SMTP and no network, like the rest of the server suite.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../_core/context.js";
import {
  PRODUCT_EVENTS,
  sanitiseProductEventMetadata,
  type ProductEvent,
} from "../../shared/productEvents.js";

const h = vi.hoisted(() => ({
  db: {
    recordProductEvent: vi.fn(),
    recordActivity: vi.fn(),
    getTripMember: vi.fn(),
    getTrip: vi.fn(),
    getTripMembers: vi.fn(),
    createTrip: vi.fn(),
    addTripMember: vi.fn(),
    upsertMemberAttendee: vi.fn(),
    updateTrip: vi.fn(),
    getTripByInviteCode: vi.fn(),
    getTripInviteByToken: vi.fn(),
    setInviteStatus: vi.fn(),
    upsertTripInvite: vi.fn(),
    createNotification: vi.fn(),
    createBudgetProposal: vi.fn(),
    getBudgetProposals: vi.fn(),
    getBudgetProposal: vi.fn(),
    getMyBudgetVote: vi.fn(),
    voteBudgetProposal: vi.fn(),
    applyGroupVoteExclusivity: vi.fn(),
    saveTripPreferences: vi.fn(),
    getDateProposal: vi.fn(),
    getMyDateVote: vi.fn(),
    voteDateProposal: vi.fn(),
    getAccommodation: vi.fn(),
    setAccommodationLock: vi.fn(),
  },
  sendTripInviteEmail: vi.fn(),
}));

vi.mock("../db.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../db.js")>();
  return { ...actual, ...h.db };
});
vi.mock("../utils/mailer.js", () => ({
  sendTripInviteEmail: h.sendTripInviteEmail,
}));

const { appRouter } = await import("./index.js");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function signedIn(id = 7): AuthenticatedUser {
  return {
    id,
    openId: "test-user-" + id,
    email: "test" + id + "@example.com",
    name: "Ada Lovelace",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as AuthenticatedUser;
}

function makeCtx(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
      get: () => "beta.example.com",
    } as unknown as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

const caller = () => appRouter.createCaller(makeCtx(signedIn()));

/** The trip role `requireTripRole` will find for the caller. */
function memberIs(role: "watcher" | "tripmate" | "admin" | null) {
  h.db.getTripMember.mockResolvedValue(
    role ? { tripId: 1, userId: 7, role, status: "accepted" } : undefined
  );
}

const recorded = () =>
  h.db.recordProductEvent.mock.calls.map(
    ([entry]) => entry as { event: ProductEvent; metadata?: object }
  );
const eventsRecorded = () => recorded().map(e => e.event);

/** A budget proposal, so the boundary tests do not repeat four fields each. */
const aBudget = {
  tripId: 1,
  title: "Dinner budget",
  amount: "12.00",
  scope: "per_person" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  memberIs("admin");
  h.db.getTrip.mockResolvedValue({ id: 1, name: "Girona", status: "planning" });
  h.db.getTripMembers.mockResolvedValue([]);
  h.db.getBudgetProposals.mockResolvedValue([]);
  h.db.createTrip.mockResolvedValue(11);
  h.db.upsertMemberAttendee.mockResolvedValue(undefined);
  h.db.createBudgetProposal.mockResolvedValue(3);
  h.db.applyGroupVoteExclusivity.mockResolvedValue([]);
  h.db.getMyBudgetVote.mockResolvedValue(undefined);
  h.db.getBudgetProposal.mockResolvedValue({ id: 3, tripId: 1, title: "B" });
  h.db.getTripByInviteCode.mockResolvedValue({
    id: 1,
    name: "Girona",
    inviteCode: "code",
  });
  h.db.upsertTripInvite.mockResolvedValue({ id: 5, token: "tok" });
  h.db.getDateProposal.mockResolvedValue({ id: 2, tripId: 1, label: "May" });
  h.db.getMyDateVote.mockResolvedValue(undefined);
  h.db.getAccommodation.mockResolvedValue({
    id: 4,
    tripId: 1,
    name: "Casa Blanca",
  });
  h.sendTripInviteEmail.mockResolvedValue({ delivered: true });
});

describe("events are recorded where the action happens", () => {
  it("records a trip created, and tells a clone apart from a fresh one", async () => {
    await caller().trips.create({ name: "Girona", currency: "EUR" });
    expect(recorded()).toEqual([
      expect.objectContaining({
        event: "trip.created",
        metadata: { cloned: false },
      }),
    ]);
  });

  it("records an invite sent, with the role and not the address", async () => {
    await caller().trips.sendInviteEmail({
      tripId: 1,
      email: "someone@example.com",
      role: "tripmate",
    });
    const [event] = recorded();
    expect(event.event).toBe("invite.sent");
    expect(event.metadata).toEqual({ role: "tripmate" });
    expect(JSON.stringify(event)).not.toContain("@");
  });

  it("records an invite accepted, with how they arrived", async () => {
    await caller().trips.join({ inviteCode: "code" });
    expect(recorded()).toContainEqual(
      expect.objectContaining({
        event: "invite.accepted",
        metadata: { role: "tripmate", via: "link" },
      })
    );
  });

  it("records a preference saved as a count of sections, not their text", async () => {
    await caller().preferences.save({
      tripId: 1,
      mustHaves: "step-free access",
      strongPreferences: "",
      avoids: "red-eye flights",
      openComments: "   ",
    });
    const [event] = recorded();
    expect(event.event).toBe("preference.saved");
    expect(event.metadata).toEqual({ sections: 2 });
    expect(JSON.stringify(event.metadata)).not.toMatch(/flight|access/i);
  });

  it("separates a first vote from a changed one", async () => {
    await caller().dates.vote({ proposalId: 2, vote: "available" });
    expect(recorded()[0].metadata).toEqual({ kind: "date", changed: false });

    vi.clearAllMocks();
    memberIs("tripmate");
    h.db.getDateProposal.mockResolvedValue({ id: 2, tripId: 1 });
    h.db.getMyDateVote.mockResolvedValue({ vote: "maybe" });
    await caller().dates.vote({ proposalId: 2, vote: "unavailable" });
    expect(recorded()[0].metadata).toEqual({ kind: "date", changed: true });
  });

  it("records a budget as a proposal, with nothing about the money", async () => {
    // Budget stopped being an expense journal and became a proposal type like
    // the other three, so it is counted as one — the title and the amount are
    // the group's business and have no field to land in.
    await caller().budget.create({
      tripId: 1,
      title: "Dinner at La Terra with Ada and Priya",
      amount: "184.50",
      currency: "EUR",
      scope: "per_person",
    });
    const [event] = recorded();
    expect(event.event).toBe("proposal.created");
    expect(event.metadata).toEqual({ kind: "budget" });
    expect(JSON.stringify(event)).not.toContain("184");
    expect(JSON.stringify(event)).not.toMatch(/Terra|Ada|Priya/);
  });

  it("records finalising an accommodation, but not un-finalising one", async () => {
    await caller().accommodations.setLock({ accommodationId: 4, locked: true });
    expect(eventsRecorded()).toEqual(["accommodation.finalised"]);

    vi.clearAllMocks();
    memberIs("admin");
    h.db.getAccommodation.mockResolvedValue({ id: 4, tripId: 1, name: "Casa" });
    await caller().accommodations.setLock({
      accommodationId: 4,
      locked: false,
    });
    expect(eventsRecorded()).toEqual([]);
  });

  it("records a trip completed only when the status actually changes", async () => {
    await caller().trips.update({ id: 1, status: "completed" });
    expect(eventsRecorded()).toEqual(["trip.completed"]);

    // Saving the dialog again on an already-completed trip is not a second
    // completion, and counting it would inflate the decision-completion rate.
    vi.clearAllMocks();
    memberIs("admin");
    h.db.getTrip.mockResolvedValue({ id: 1, name: "G", status: "completed" });
    await caller().trips.update({ id: 1, status: "completed" });
    expect(eventsRecorded()).toEqual([]);
  });

  it("records a cancelled trip as cancelled, not as completed", async () => {
    await caller().trips.update({ id: 1, status: "cancelled" });
    expect(eventsRecorded()).toEqual(["trip.cancelled"]);
  });

  it("records nothing for an edit that leaves the status alone", async () => {
    await caller().trips.update({ id: 1, name: "Girona in May" });
    expect(eventsRecorded()).toEqual([]);
  });
});

describe("authorization boundaries", () => {
  it("records nothing for a caller who is not signed in", async () => {
    const anon = appRouter.createCaller(makeCtx(null));
    await expect(anon.trips.create({ name: "Girona" })).rejects.toThrow();
    await expect(anon.budget.create(aBudget)).rejects.toThrow();
    expect(h.db.recordProductEvent).not.toHaveBeenCalled();
  });

  it("records nothing for someone who is not on the trip", async () => {
    memberIs(null);
    await expect(
      caller().dates.vote({ proposalId: 2, vote: "available" })
    ).rejects.toThrow(/not a member/i);
    await expect(caller().budget.create(aBudget)).rejects.toThrow(
      /not a member/i
    );
    await expect(
      caller().preferences.save({
        tripId: 1,
        mustHaves: "a",
        strongPreferences: "",
        avoids: "",
        openComments: "",
      })
    ).rejects.toThrow(/not a member/i);
    expect(h.db.recordProductEvent).not.toHaveBeenCalled();
  });

  it("does not count a watcher's refused contribution as participation", async () => {
    memberIs("watcher");
    await expect(
      caller().dates.vote({ proposalId: 2, vote: "available" })
    ).rejects.toThrow();
    await expect(caller().budget.create(aBudget)).rejects.toThrow();
    expect(h.db.recordProductEvent).not.toHaveBeenCalled();
    // …and the action itself did not happen either, which is why the count is
    // right rather than coincidentally right.
    expect(h.db.voteDateProposal).not.toHaveBeenCalled();
    expect(h.db.createBudgetProposal).not.toHaveBeenCalled();
  });

  it("does not count an admin-only decision taken by a tripmate", async () => {
    memberIs("tripmate");
    await expect(
      caller().accommodations.setLock({ accommodationId: 4, locked: true })
    ).rejects.toThrow();
    await expect(
      caller().trips.update({ id: 1, status: "completed" })
    ).rejects.toThrow();
    await expect(
      caller().trips.sendInviteEmail({ tripId: 1, email: "a@example.com" })
    ).rejects.toThrow();
    // The referee is the expensive one: a run refused by the role check must
    // not appear in the AI-usage figure.
    await expect(
      caller().referee.analyze({ tripId: 1, phase: "dates" })
    ).rejects.toThrow();
    expect(h.db.recordProductEvent).not.toHaveBeenCalled();
    expect(h.db.setAccommodationLock).not.toHaveBeenCalled();
    expect(h.db.updateTrip).not.toHaveBeenCalled();
  });
});

describe("every call site agrees with the contract", () => {
  /**
   * If a router ever passes a field the contract does not describe, the
   * recorder drops it silently and whatever was built on it is empty. Better
   * to find the disagreement here than three months into a beta.
   */
  it("names a known event and passes metadata that survives sanitising", async () => {
    await caller().trips.create({ name: "Girona" });
    await caller().trips.join({ inviteCode: "code" });
    await caller().dates.vote({ proposalId: 2, vote: "available" });
    await caller().budget.create({ ...aBudget, scope: "trip_total" });
    await caller().preferences.save({
      tripId: 1,
      mustHaves: "a",
      strongPreferences: "",
      avoids: "",
      openComments: "",
    });
    await caller().accommodations.setLock({ accommodationId: 4, locked: true });
    await caller().trips.update({ id: 1, status: "completed" });

    const calls = recorded();
    expect(calls.length).toBeGreaterThanOrEqual(7);
    for (const { event, metadata } of calls) {
      expect(PRODUCT_EVENTS).toContain(event);
      const clean = sanitiseProductEventMetadata(
        event,
        metadata as Record<string, unknown>
      );
      expect(
        clean.rejected,
        event + " passes a field the contract drops"
      ).toEqual([]);
      expect(clean.metadata).toEqual(metadata ?? {});
    }
  });
});
