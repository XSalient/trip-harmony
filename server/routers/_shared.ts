/**
 * Helpers shared by more than one domain router.
 * Anything used by a single router belongs in that router's own file.
 */
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import type { User } from "../../drizzle/schema.js";
import {
  canSeeMemberDetails,
  hasTripRole,
  type TripRole,
} from "../../shared/roles.js";
import { finaliseBlockReason } from "../../shared/votes.js";
import {
  FREE_ACTIVE_TRIP_LIMIT,
  isEntitled,
  TRIP_LIMIT_ERR_MSG,
} from "../../shared/billing.js";
import { config } from "../_core/env.js";
import * as db from "../db.js";

/**
 * Refuse a new trip when a free account is already organising one.
 *
 * The only paywall in the app, and it sits on **creating** a trip. Being
 * invited to one is free and unlimited: a paying organiser must never drag
 * their friends into paying, both because it would stall the group and because
 * the person who started the trip is the one who chose to spend anything.
 *
 * Two ways this lets somebody through, both deliberate:
 *
 * - `BILLING_ENABLED=false` — a paused product, not a broken one. Everybody
 *   gets everything rather than nobody being able to plan.
 * - No RevenueCat key configured — a development database, or a deployment that
 *   has not set billing up. Charging nobody is right; refusing everybody is not.
 *
 * With billing on and configured, an account with no subscription row is free,
 * which is the failing-closed direction: the row is written only by the
 * webhook, so an absent one means no purchase was confirmed.
 */
export async function requireTripAllowance(userId: number) {
  if (!config.billing.enabled || !config.billing.isConfigured) return;

  const subscription = await db.getSubscription(userId);
  if (isEntitled(subscription)) return;

  const active = await db.countActiveOrganisedTrips(userId);
  if (active < FREE_ACTIVE_TRIP_LIMIT) return;

  throw new TRPCError({ code: "FORBIDDEN", message: TRIP_LIMIT_ERR_MSG });
}

/**
 * The user fields that are safe to send to a browser.
 *
 * Built as an allow-list rather than by deleting `passwordHash`, so a column
 * added to the `users` table later cannot leak by default.
 */
export type PublicUser = Pick<
  User,
  | "id"
  | "openId"
  | "name"
  | "email"
  | "role"
  | "avatarUrl"
  | "loginMethod"
  | "createdAt"
  | "lastSignedIn"
>;

export function toPublicUser(user: User): PublicUser;
export function toPublicUser(user: User | null | undefined): PublicUser | null;
export function toPublicUser(user: User | null | undefined): PublicUser | null {
  if (!user) return null;
  return {
    id: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    loginMethod: user.loginMethod,
    createdAt: user.createdAt,
    lastSignedIn: user.lastSignedIn,
  };
}

/**
 * Asserts the caller is a member of the trip with at least `atLeast`, and
 * returns their membership row.
 *
 * Every trip-scoped procedure goes through this. Before it, authorisation was a
 * scattering of inline `isTripOrganizer()` checks and a majority of procedures
 * that checked nothing beyond being signed in.
 *
 * Non-membership is FORBIDDEN rather than NOT_FOUND on purpose: NOT_FOUND would
 * confirm the trip exists to someone with no business knowing.
 */
export async function requireTripRole(
  tripId: number,
  userId: number,
  atLeast: TripRole
) {
  const member = await db.getTripMember(tripId, userId);
  if (!member || member.status !== "accepted") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this trip.",
    });
  }
  if (!hasTripRole(member.role, atLeast)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      // Not all of these are writes — a watcher is refused the referee feed and
      // the invite list too — so the message says what their role allows rather
      // than assuming they tried to change something.
      message:
        atLeast === "admin"
          ? "Only trip admins can do that."
          : "Watchers can see the trip's plans, but not this.",
    });
  }
  return member;
}

/** The caller's role, for deciding how much of a payload to return. */
export async function tripRoleOf(
  tripId: number,
  userId: number
): Promise<TripRole> {
  const member = await requireTripRole(tripId, userId, "watcher");
  return member.role;
}

/**
 * Strips everything personal from a proposal for a watcher: who proposed it,
 * when, who voted which way, and how well it matched each member's stated
 * requirements. The vote *count* survives, because a watcher following a trip
 * should still see that a decision is being made.
 *
 * Done here rather than in the page, for the same reason `toPublicUser` exists:
 * a component that declines to render a field has already received it, and the
 * next component to touch that data will render it.
 *
 * **The return type is the un-projected shape.** Typing the stripped fields as
 * optional would be more truthful, but it ripples into every consumer of an
 * already `any`-heavy client for no runtime gain — the payload is what matters
 * and the payload is genuinely stripped. `back-to-travelling.test.ts` asserts
 * that over the wire; treat that test, not this signature, as the guarantee.
 */
export function projectProposalForRole<
  T extends {
    proposedBy?: number;
    proposer?: unknown;
    createdAt?: Date | string;
    lockedBy?: number | null;
    lockedAt?: Date | string | null;
    votes?: unknown[];
    matchAnalysis?: string | null;
    matchAnalysedAt?: Date | string | null;
    proposedByUser?: unknown;
  },
>(proposal: T, role: TripRole): T {
  if (canSeeMemberDetails(role)) return proposal;
  // `selected` stays: a watcher should see that a decision was made. Who made
  // it, and when, is attribution and goes with the rest.
  //
  // `matchAnalysis` goes too, and it is the least obvious of these: the JSON
  // holds a per-member breakdown — a name, a score and the reason, which is
  // that member's own stated requirement read back ("needs step-free access").
  // It is the most personal thing on the whole screen, and it was the one
  // field a watcher was still being handed.
  //
  // `proposedByUser` is a second spelling of `proposer` that a router once
  // returned, which is how one screen kept showing watchers "by Priya" while
  // every other screen had stopped. Both are stripped here, so a third
  // spelling is the only way to reintroduce the leak.
  const {
    proposedBy,
    proposer,
    createdAt,
    lockedBy,
    lockedAt,
    votes,
    matchAnalysis,
    matchAnalysedAt,
    proposedByUser,
    ...rest
  } = proposal;
  return {
    ...rest,
    // Keep the shape the client expects — a list of the right length whose
    // entries carry no identity.
    votes: (votes ?? []).map((v: any) => ({ vote: v?.vote })),
  } as unknown as T;
}

export function projectProposalsForRole<
  T extends {
    proposedBy?: number;
    proposer?: unknown;
    createdAt?: Date | string;
    lockedBy?: number | null;
    lockedAt?: Date | string | null;
    votes?: unknown[];
    matchAnalysis?: string | null;
    matchAnalysedAt?: Date | string | null;
    proposedByUser?: unknown;
  },
>(proposals: T[], role: TripRole): T[] {
  if (canSeeMemberDetails(role)) return proposals;
  return proposals.map(p => projectProposalForRole(p, role));
}

/**
 * A watcher gets names, roles and which group somebody is in. No email, no
 * budget ceiling, no record of who invited whom.
 *
 * `groupId` survives because a watcher following a trip of families should be
 * able to see that it *is* a trip of families — the grouping is the shape of
 * the trip, not a fact about a person. What the group can afford is not, and
 * `budgetMax` is stripped from the group as well as from the member (see
 * `projectGroupsForRole` in `groups.ts`).
 */
export function projectMembersForRole<
  T extends {
    userId: number;
    role: TripRole;
    status: string;
    groupId?: number | null;
    user?: { id: number; name: string | null; email?: string | null } | null;
  },
>(members: T[], role: TripRole): T[] {
  if (canSeeMemberDetails(role)) return members;
  return members.map(m => ({
    id: (m as any).id,
    tripId: (m as any).tripId,
    userId: m.userId,
    role: m.role,
    status: m.status,
    groupId: m.groupId ?? null,
    user: m.user ? { id: m.user.id, name: m.user.name } : null,
  })) as unknown as T[];
}

/** Gemini 2.5 thinking models return content as an array of parts; extract plain text safely */
export function extractLLMText(response: any, fallback = ""): string {
  const content = response?.choices?.[0]?.message?.content;
  if (!content) return fallback;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (
      content
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text || "")
        .join("") || fallback
    );
  }
  return fallback;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err);
      else resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  const [salt, key] = hash.split(":");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      else resolve(derived.toString("hex") === key);
    });
  });
}

/**
 * Refuses to finalise a proposal that everybody abstained on.
 *
 * "Go with the majority" is an abstention. When every cast vote is one, there
 * is no majority to defer to — the group looks unanimous and has in fact said
 * nothing. Picking a side on their behalf, or letting it lock silently, is how
 * a decision nobody made ends up on the trip.
 *
 * Guard the **lock** only. Un-finalising must always be possible: something
 * already locked in that state has to be reversible.
 *
 * A proposal with no votes at all is not blocked — an admin locking in the one
 * stay anybody found is a real thing people do, and `finaliseBlockReason` says
 * so.
 */
export function assertFinalisable(votes: Array<{ vote: string }>) {
  const reason = finaliseBlockReason(votes);
  if (reason)
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: reason });
}
