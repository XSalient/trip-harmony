/**
 * Who a trip lets in, and on whose say-so.
 *
 * Both halves used to be "anybody holding a URL". The shared link made a
 * voting tripmate on sight, so a link forwarded into a group chat — or left in
 * a browser on a shared laptop — was a seat at the trip. And an emailed invite
 * was never bound to the person it was sent to, nor spent when it was used, so
 * one invitation let in as many people as it was forwarded to, for as long as
 * the trip existed.
 *
 * The rules now:
 *
 *   shared link        → a **request**. An admin answers it.
 *   emailed invite     → joins outright, but only for the address it was sent
 *                        to, and only once.
 *   demo trips         → exempt from both, because a sales tour has nobody on
 *                        the other side to approve anybody (`isDemoTrip`).
 *
 * Run against a stubbed database, like `productMeasurement.test.ts`: the rules
 * are decisions the procedure makes, and every one of them is observable in
 * what it writes.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { TrpcContext } from "../_core/context.js";

const h = vi.hoisted(() => ({
  db: {
    getTrip: vi.fn(),
    getTripByInviteCode: vi.fn(),
    getTripMember: vi.fn(),
    getTripMembers: vi.fn(),
    getTripInviteByToken: vi.fn(),
    setInviteStatus: vi.fn(),
    addTripMember: vi.fn(),
    setMemberStatus: vi.fn(),
    upsertMemberAttendee: vi.fn(),
    createNotification: vi.fn(),
    recordActivity: vi.fn(),
    recordProductEvent: vi.fn(),
    getUserById: vi.fn(),
  },
}));

vi.mock("../db.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../db.js")>();
  return { ...actual, ...h.db };
});

const { appRouter } = await import("./index.js");

const INVITEE = "nina@example.com";

function signedIn(email = INVITEE): NonNullable<TrpcContext["user"]> {
  return {
    id: 7,
    openId: "test-user-7",
    email,
    name: "Nina Okafor",
    loginMethod: "password",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as NonNullable<TrpcContext["user"]>;
}

const caller = (user = signedIn()) =>
  appRouter.createCaller({
    user,
    req: {
      protocol: "https",
      headers: {},
      get: () => "wevotrip.example",
    } as unknown as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  } as TrpcContext);

/** A trip reachable by its shared code. `code` decides whether it is the demo. */
function tripIs(inviteCode = "aBcDeFgHiJkL") {
  h.db.getTripByInviteCode.mockResolvedValue({
    id: 1,
    name: "Girona",
    inviteCode,
    description: null,
  });
  h.db.getTrip.mockResolvedValue({ id: 1, name: "Girona", inviteCode });
}

/** The emailed invitation behind `?invite=tok`. */
function inviteIs(over: Record<string, unknown> = {}) {
  h.db.getTripInviteByToken.mockResolvedValue({
    id: 5,
    tripId: 1,
    email: INVITEE,
    role: "tripmate",
    status: "pending",
    invitedBy: 3,
    groupId: null,
    ...over,
  });
}

const memberWritten = () => h.db.addTripMember.mock.calls[0]?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  tripIs();
  h.db.getTripMember.mockResolvedValue(undefined);
  h.db.getTripMembers.mockResolvedValue([]);
  h.db.getUserById.mockResolvedValue({ id: 7, name: "Nina Okafor" });
});

describe("the shared link", () => {
  it("asks rather than joins", async () => {
    const result = await caller().trips.join({ inviteCode: "aBcDeFgHiJkL" });
    expect(result).toMatchObject({ tripId: 1, status: "pending" });
    expect(memberWritten()).toMatchObject({
      status: "pending",
      joinedVia: "link",
      respondedAt: null,
    });
  });

  it("puts nobody in the headcount while they are waiting", async () => {
    // The figure every per-person cost divides by. A request that counted
    // would change what the trip thinks it is spending, before anybody agreed
    // the requester is coming.
    await caller().trips.join({ inviteCode: "aBcDeFgHiJkL" });
    expect(h.db.upsertMemberAttendee).not.toHaveBeenCalled();
  });

  it("tells the trip's admins, and nobody else", async () => {
    h.db.getTripMembers.mockResolvedValue([
      { userId: 3, role: "admin" },
      { userId: 4, role: "tripmate" },
      { userId: 5, role: "watcher" },
    ]);
    await caller().trips.join({ inviteCode: "aBcDeFgHiJkL" });
    const told = h.db.createNotification.mock.calls.map(([c]) => c.userId);
    expect(told).toEqual([3]);
  });

  it("re-opens a request that was turned down before", async () => {
    h.db.getTripMember.mockResolvedValue({
      tripId: 1,
      userId: 7,
      role: "tripmate",
      status: "declined",
    });
    await caller().trips.join({ inviteCode: "aBcDeFgHiJkL" });
    expect(h.db.setMemberStatus).toHaveBeenCalledWith(
      1,
      7,
      "pending",
      expect.objectContaining({ joinedVia: "link" })
    );
    expect(h.db.addTripMember).not.toHaveBeenCalled();
  });

  it("is idempotent for somebody already on the trip", async () => {
    h.db.getTripMember.mockResolvedValue({
      tripId: 1,
      userId: 7,
      role: "tripmate",
      status: "accepted",
    });
    const result = await caller().trips.join({ inviteCode: "aBcDeFgHiJkL" });
    expect(result).toMatchObject({ status: "accepted" });
    expect(h.db.addTripMember).not.toHaveBeenCalled();
    expect(h.db.setMemberStatus).not.toHaveBeenCalled();
  });
});

describe("an emailed invitation", () => {
  it("joins outright, with the role it named", async () => {
    inviteIs({ role: "watcher", groupId: 2 });
    const result = await caller().trips.join({
      inviteCode: "aBcDeFgHiJkL",
      inviteToken: "tok",
    });
    expect(result).toMatchObject({ status: "accepted" });
    expect(memberWritten()).toMatchObject({
      status: "accepted",
      role: "watcher",
      joinedVia: "email",
      groupId: 2,
    });
    expect(h.db.upsertMemberAttendee).toHaveBeenCalled();
  });

  it("is spent by accepting it", async () => {
    inviteIs();
    await caller().trips.join({
      inviteCode: "aBcDeFgHiJkL",
      inviteToken: "tok",
    });
    expect(h.db.setInviteStatus).toHaveBeenCalledWith(5, "accepted");
  });

  it("cannot be used twice", async () => {
    inviteIs({ status: "accepted" });
    await expect(
      caller().trips.join({ inviteCode: "aBcDeFgHiJkL", inviteToken: "tok" })
    ).rejects.toThrow(/already been used/i);
    expect(h.db.addTripMember).not.toHaveBeenCalled();
  });

  it("cannot be used after it was declined", async () => {
    inviteIs({ status: "declined" });
    await expect(
      caller().trips.join({ inviteCode: "aBcDeFgHiJkL", inviteToken: "tok" })
    ).rejects.toThrow(/already been used/i);
  });

  it("cannot be used after it was revoked", async () => {
    inviteIs({ status: "revoked" });
    await expect(
      caller().trips.join({ inviteCode: "aBcDeFgHiJkL", inviteToken: "tok" })
    ).rejects.toThrow(/withdrawn/i);
  });

  it("belongs to the address it was sent to, not to whoever has the link", async () => {
    inviteIs({ role: "admin" });
    const result = await caller(
      signedIn("someone.else@example.com")
    ).trips.join({ inviteCode: "aBcDeFgHiJkL", inviteToken: "tok" });
    // Not refused outright — they land in the same queue as any link joiner,
    // so an admin can still add them — but the invitation's role is not theirs
    // to take, and it stays open for the person it was sent to.
    expect(result).toMatchObject({
      status: "pending",
      reason: "wrong-address",
    });
    expect(memberWritten()).toMatchObject({
      status: "pending",
      role: "tripmate",
    });
    expect(h.db.setInviteStatus).not.toHaveBeenCalled();
  });

  it("matches the address case-insensitively, and ignores stray spaces", async () => {
    inviteIs({ email: "  NINA@Example.com " });
    const result = await caller().trips.join({
      inviteCode: "aBcDeFgHiJkL",
      inviteToken: "tok",
    });
    expect(result).toMatchObject({ status: "accepted" });
  });

  it("is refused when it is not this trip's", async () => {
    inviteIs({ tripId: 99 });
    await expect(
      caller().trips.join({ inviteCode: "aBcDeFgHiJkL", inviteToken: "tok" })
    ).rejects.toThrow(/isn't valid for this trip/i);
  });
});

describe("declining an invitation", () => {
  it("spends it", async () => {
    inviteIs();
    await caller().trips.declineInvite({ inviteToken: "tok" });
    expect(h.db.setInviteStatus).toHaveBeenCalledWith(5, "declined");
  });

  it("cannot be answered twice", async () => {
    inviteIs({ status: "declined" });
    await expect(
      caller().trips.declineInvite({ inviteToken: "tok" })
    ).rejects.toThrow(/already been answered/i);
  });

  it("is not a stranger's to answer", async () => {
    // A forwarded link would otherwise let anybody decline on the invitee's
    // behalf — a quiet way to keep somebody off a trip.
    inviteIs();
    await expect(
      caller(signedIn("someone.else@example.com")).trips.declineInvite({
        inviteToken: "tok",
      })
    ).rejects.toThrow(/different email address/i);
    expect(h.db.setInviteStatus).not.toHaveBeenCalled();
  });
});

describe("an admin answering a request", () => {
  /** The caller is an admin; the subject is the pending requester. */
  function requestFrom(status = "pending") {
    h.db.getTripMember
      .mockResolvedValueOnce({
        tripId: 1,
        userId: 7,
        role: "admin",
        status: "accepted",
      })
      .mockResolvedValueOnce({
        tripId: 1,
        userId: 8,
        role: "tripmate",
        status,
        joinedVia: "link",
        groupId: null,
      });
  }

  it("lets them in, in the seat the admin picked", async () => {
    requestFrom();
    const result = await caller().trips.respondToJoinRequest({
      tripId: 1,
      userId: 8,
      decision: "approve",
      role: "watcher",
    });
    expect(result).toMatchObject({ status: "accepted" });
    expect(h.db.setMemberStatus).toHaveBeenCalledWith(1, 8, "accepted", {
      role: "watcher",
    });
    // Only now are they somebody the trip is planning around.
    expect(h.db.upsertMemberAttendee).toHaveBeenCalled();
  });

  it("turns them down without removing the record", async () => {
    requestFrom();
    await caller().trips.respondToJoinRequest({
      tripId: 1,
      userId: 8,
      decision: "decline",
    });
    expect(h.db.setMemberStatus).toHaveBeenCalledWith(1, 8, "declined");
    expect(h.db.upsertMemberAttendee).not.toHaveBeenCalled();
  });

  it("refuses a request somebody has already answered", async () => {
    // Two admins with the members screen open.
    requestFrom("accepted");
    await expect(
      caller().trips.respondToJoinRequest({
        tripId: 1,
        userId: 8,
        decision: "approve",
      })
    ).rejects.toThrow(/already been answered/i);
  });

  it("is refused to a tripmate", async () => {
    h.db.getTripMember.mockResolvedValue({
      tripId: 1,
      userId: 7,
      role: "tripmate",
      status: "accepted",
    });
    await expect(
      caller().trips.respondToJoinRequest({
        tripId: 1,
        userId: 8,
        decision: "approve",
      })
    ).rejects.toThrow(/admins/i);
    expect(h.db.setMemberStatus).not.toHaveBeenCalled();
  });
});

describe("the demo tour is exempt", () => {
  it("joins outright from the shared link, because nobody is there to approve", async () => {
    tripIs("DEMO-LISBON");
    const result = await caller().trips.join({ inviteCode: "DEMO-LISBON" });
    expect(result).toMatchObject({ status: "accepted" });
    expect(memberWritten()).toMatchObject({ status: "accepted" });
  });

  it("still honours a seeded invitation that has already been taken up", async () => {
    tripIs("DEMO-CHAMONIX");
    inviteIs({ status: "accepted", email: "nina@demo.wevotrip.example" });
    const result = await caller().trips.join({
      inviteCode: "DEMO-CHAMONIX",
      inviteToken: "demo-chamonix-nina-invite",
    });
    expect(result).toMatchObject({ status: "accepted" });
  });
});
