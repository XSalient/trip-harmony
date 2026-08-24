/**
 * Recording and sending one trip invite.
 *
 * Extracted from `trips.sendInviteEmail` when importing a family from the
 * contact book became a second thing that invites people. Two places building
 * the invite URL, deciding what a failed send means, and writing the activity
 * row is two places for those to diverge — and the one that diverges quietly
 * is the URL, which decides whether "joined by email invite" is
 * distinguishable from "followed the shared link" at all.
 *
 * **Authorisation is deliberately not here.** Who may invite whom to what role
 * is a rule about the trip, and it stays in the router where it can be read
 * beside the rest of the trip's rules — see `trips.sendInviteEmail` and
 * `contacts.importGroupToTrip`, which enforce the same one.
 */
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import type { Request } from "express";
import * as db from "../db.js";
import { config } from "../_core/env.js";
import { sendTripInviteEmail } from "./mailer.js";
import type { TripRole } from "../../shared/roles.js";

/** The origin to build an invite link against, behind a proxy or not. */
export function originOf(req: Request): string {
  const proto = req.get("x-forwarded-proto") || req.protocol;
  return `${proto}://${req.get("host")}`;
}

export async function sendInvite({
  trip,
  email,
  role,
  groupId = null,
  invitedBy,
  inviterName,
  origin,
  /**
   * Whether a failed send should fail the call. False when inviting a family
   * of five: one bad address must not lose the other four, and the caller
   * reports which ones did not go.
   */
  throwOnFailure = true,
}: {
  trip: { id: number; name: string; inviteCode: string };
  email: string;
  role: TripRole;
  groupId?: number | null;
  invitedBy: number;
  inviterName: string;
  origin: string;
  throwOnFailure?: boolean;
}) {
  // Record the invite before sending, so a send that fails still leaves the
  // members page able to say who was invited and to what address.
  const invite = await db.upsertTripInvite({
    tripId: trip.id,
    email,
    role,
    groupId,
    invitedBy,
    token: nanoid(32),
  });

  // Carries the invite token, not just the trip's shared code — that is what
  // makes "joined by email invite" distinguishable from "followed the link".
  const inviteUrl = `${origin}/join/${trip.inviteCode}?invite=${invite.token}`;
  const delivery = await sendTripInviteEmail(
    email,
    inviterName,
    trip.name,
    inviteUrl
  );

  // Outside production the link is in the log, so a failed send is
  // recoverable; in production, say so rather than implying it arrived.
  if (!delivery.delivered && config.isProduction && throwOnFailure) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        delivery.reason === "not_configured"
          ? "We couldn't send the invite email. Email delivery isn't configured for this deployment yet — share the invite link directly for now."
          : "We couldn't send the invite email to that address. Copy the invite link and share it directly instead.",
    });
  }

  await db.recordActivity({
    tripId: trip.id,
    actorUserId: invitedBy,
    action: "member.invited",
    entityType: "invite",
    entityId: invite.id,
    metadata: { email, role, groupId },
  });

  return { inviteId: invite.id, delivered: delivery.delivered };
}
