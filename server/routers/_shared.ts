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
import * as db from "../db.js";

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
 * when, and who voted which way. The vote *count* survives, because a watcher
 * following a trip should still see that a decision is being made.
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
    createdAt?: Date | string;
    lockedBy?: number | null;
    lockedAt?: Date | string | null;
    votes?: unknown[];
  },
>(proposal: T, role: TripRole): T {
  if (canSeeMemberDetails(role)) return proposal;
  // `selected` stays: a watcher should see that a decision was made. Who made
  // it, and when, is attribution and goes with the rest.
  const { proposedBy, createdAt, lockedBy, lockedAt, votes, ...rest } =
    proposal;
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
    createdAt?: Date | string;
    lockedBy?: number | null;
    lockedAt?: Date | string | null;
    votes?: unknown[];
  },
>(proposals: T[], role: TripRole): T[] {
  if (canSeeMemberDetails(role)) return proposals;
  return proposals.map(p => projectProposalForRole(p, role));
}

/**
 * A watcher gets names and roles. No email, no budget ceiling, no record of who
 * invited whom.
 */
export function projectMembersForRole<
  T extends {
    userId: number;
    role: TripRole;
    status: string;
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
