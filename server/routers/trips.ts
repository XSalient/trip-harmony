/**
 * Trip records, membership, roles, invite codes and invite emails.
 */
import { publicProcedure, protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import * as db from "../db.js";
import { config } from "../_core/env.js";
import { sendTripInviteEmail } from "../utils/mailer.js";
import {
  requireTripRole,
  tripRoleOf,
  projectMembersForRole,
} from "./_shared.js";
import { TRIP_ROLES } from "../../shared/roles.js";

const roleInput = z.enum(TRIP_ROLES);

export const tripsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getUserTrips(ctx.user.id);
  }),
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.id, ctx.user.id, "watcher");
      const trip = await db.getTrip(input.id);
      if (!trip) return trip;
      // `voterCount` is derived once, here, rather than per screen. Two
      // derivations of one number is how one page says "2/4 voted" while the
      // next says "2/3" — and with groups there are now two right answers
      // depending on the trip's voting unit.
      return { ...trip, voterCount: await db.getTripVoterCount(input.id) };
    }),
  /** The caller's own role, so the UI knows which controls to render. */
  myRole: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await db.getTripMember(input.tripId, ctx.user.id);
      if (!member || member.status !== "accepted") return { role: null };
      return { role: member.role };
    }),
  getByInviteCode: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      return db.getTripByInviteCode(input.code);
    }),
  sendInviteEmail: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        email: z.string().email(),
        role: roleInput.default("tripmate"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // A tripmate may bring their own family in to *watch*, but not to vote.
      // On a trip of families the person who knows who is in a household is the
      // person in it, and having to ask an admin to add your own mother is the
      // kind of friction that ends with her not being on the trip at all.
      //
      // Safe to loosen only because of what a watcher is: they change nothing,
      // and `getTripVoterCount` leaves them out of every denominator — so this
      // cannot grow the voting group behind an admin's back. Inviting anyone
      // who *can* vote stays admin-only, and so does the shared invite link,
      // which makes tripmates.
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      if (input.role !== "watcher")
        await requireTripRole(input.tripId, ctx.user.id, "admin");

      const trip = await db.getTrip(input.tripId);
      if (!trip)
        throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });

      // Record the invite before sending, so a send that fails still leaves the
      // members page able to say who was invited and to what address.
      const invite = await db.upsertTripInvite({
        tripId: input.tripId,
        email: input.email,
        role: input.role,
        invitedBy: ctx.user.id,
        token: nanoid(32),
      });

      const proto = ctx.req.get("x-forwarded-proto") || ctx.req.protocol;
      const origin = `${proto}://${ctx.req.get("host")}`;
      // Carries the invite token, not just the trip's shared code — that is what
      // makes "joined by email invite" distinguishable from "followed the link".
      const inviteUrl = `${origin}/join/${trip.inviteCode}?invite=${invite.token}`;
      const delivery = await sendTripInviteEmail(
        input.email,
        ctx.user.name || "Someone",
        trip.name,
        inviteUrl
      );
      // Outside production the link is in the log, so a failed send is
      // recoverable; in production, say so rather than implying it arrived.
      if (!delivery.delivered && config.isProduction) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            delivery.reason === "not_configured"
              ? "We couldn't send the invite email. Email delivery isn't configured for this deployment yet — share the invite link directly for now."
              : "We couldn't send the invite email to that address. Copy the invite link and share it directly instead.",
        });
      }
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "member.invited",
        entityType: "invite",
        entityId: invite.id,
        metadata: { email: input.email, role: input.role },
      });
      return { success: true };
    }),
  invites: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Invite addresses are personal detail; watchers never see them.
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      return db.getTripInvites(input.tripId);
    }),
  revokeInvite: protectedProcedure
    .input(z.object({ tripId: z.number(), inviteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      const invites = await db.getTripInvites(input.tripId);
      const invite = invites.find(i => i.id === input.inviteId);
      if (!invite)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found.",
        });
      await db.setInviteStatus(invite.id, "revoked");
      return { success: true };
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        currency: z.string().default("USD"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const inviteCode = nanoid(12);
      const tripId = await db.createTrip({
        ...input,
        organizerId: ctx.user.id,
        inviteCode,
      });
      await db.addTripMember({
        tripId,
        userId: ctx.user.id,
        role: "admin",
        status: "accepted",
        joinedVia: "creator",
        respondedAt: new Date(),
      });
      // A member is an attendee too, so headcount is one number rather than
      // "members plus attendees, mind the overlap".
      await db.upsertMemberAttendee(
        tripId,
        ctx.user.id,
        ctx.user.name || "Member",
        null
      );
      return { id: tripId, inviteCode };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        phase: z
          .enum([
            "setup",
            "dates",
            "destination",
            "accommodation",
            "activities",
            "finalized",
          ])
          .optional(),
        status: z
          .enum(["planning", "active", "completed", "cancelled"])
          .optional(),
        currency: z.string().optional(),
        totalBudget: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Until this check existed any signed-in user could rename any trip, and
      // change its phase, status, currency and budget.
      await requireTripRole(input.id, ctx.user.id, "admin");
      const { id, ...data } = input;
      await db.updateTrip(id, data);
      await db.recordActivity({
        tripId: id,
        actorUserId: ctx.user.id,
        action: "trip.edited",
        entityType: "trip",
        entityId: id,
        metadata: { fields: Object.keys(data) },
      });
      return { success: true };
    }),
  /**
   * Deletes the trip and everything in it, for everyone.
   *
   * Admin-only and irreversible, so the name has to be typed back: this is the
   * one action in the app that destroys other people's work, and an admin who
   * meant to leave a trip must not be one tap away from ending it for the
   * whole group. `db.deleteTripCascade` does the removal in a transaction.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number(), confirmName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.id, ctx.user.id, "admin");
      const trip = await db.getTrip(input.id);
      if (!trip)
        throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });
      if (input.confirmName.trim() !== trip.name.trim())
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That name doesn't match the trip's name.",
        });

      // Told before it happens: afterwards there is no trip to hang a
      // notification off, and `deleteTripCascade` removes these rows anyway.
      const members = await db.getTripMembers(input.id);
      for (const m of members) {
        if (m.userId === ctx.user.id) continue;
        await db.createNotification({
          userId: m.userId,
          type: "general",
          title: "A trip was deleted",
          message: `${ctx.user.name || "An admin"} deleted the trip "${trip.name}".`,
        });
      }

      await db.deleteTripCascade(input.id);
      return { success: true };
    }),
  /**
   * A fresh trip carrying this one's proposals.
   *
   * Admin-only for the same reason `invites` is: cloning copies the whole plan,
   * and a watcher is on a trip to follow it rather than to take a copy of it.
   * What does and does not come across is decided in `db.cloneTripContents`.
   */
  clone: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.id, ctx.user.id, "admin");
      const source = await db.getTrip(input.id);
      if (!source)
        throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });

      const name = input.name?.trim() || `${source.name} (copy)`;
      const tripId = await db.createTrip({
        name: name.slice(0, 255),
        description: source.description,
        currency: source.currency,
        totalBudget: source.totalBudget,
        organizerId: ctx.user.id,
        // A new code: sharing the original's would put anyone following an old
        // link into whichever of the two trips resolved first.
        inviteCode: nanoid(12),
      });
      await db.addTripMember({
        tripId,
        userId: ctx.user.id,
        role: "admin",
        status: "accepted",
        joinedVia: "creator",
        respondedAt: new Date(),
      });
      await db.upsertMemberAttendee(
        tripId,
        ctx.user.id,
        ctx.user.name || "Member",
        null
      );

      await db.cloneTripContents(input.id, tripId, ctx.user.id);
      await db.recordActivity({
        tripId,
        actorUserId: ctx.user.id,
        action: "trip.cloned",
        entityType: "trip",
        entityId: tripId,
        metadata: { from: input.id },
      });
      return { id: tripId };
    }),
  join: protectedProcedure
    .input(
      z.object({
        inviteCode: z.string(),
        /** Present when they followed an emailed invite rather than a shared link. */
        inviteToken: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trip = await db.getTripByInviteCode(input.inviteCode);
      if (!trip)
        throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });

      // An emailed invite decides the role and records how they arrived; a bare
      // link makes them a tripmate.
      let role: "watcher" | "tripmate" | "admin" = "tripmate";
      let joinedVia: "link" | "email" = "link";
      let invitedBy: number | null = null;

      if (input.inviteToken) {
        const invite = await db.getTripInviteByToken(input.inviteToken);
        if (
          invite &&
          invite.tripId === trip.id &&
          invite.status !== "revoked"
        ) {
          role = invite.role;
          joinedVia = "email";
          invitedBy = invite.invitedBy;
          await db.setInviteStatus(invite.id, "accepted");
        }
      }

      await db.addTripMember({
        tripId: trip.id,
        userId: ctx.user.id,
        role,
        status: "accepted",
        joinedVia,
        invitedBy,
        respondedAt: new Date(),
      });
      // Idempotent: a re-accepted invite must not count somebody twice, which
      // a partial unique index on (tripId, memberUserId) also enforces.
      await db.upsertMemberAttendee(
        trip.id,
        ctx.user.id,
        ctx.user.name || "Member",
        null
      );

      await db.recordActivity({
        tripId: trip.id,
        actorUserId: ctx.user.id,
        action: "member.joined",
        entityType: "member",
        entityId: ctx.user.id,
        metadata: { role, joinedVia },
      });

      // Tell the admins, not the whole trip — and never a watcher.
      const members = await db.getTripMembers(trip.id);
      for (const m of members) {
        if (m.userId !== ctx.user.id && m.role === "admin") {
          await db.createNotification({
            userId: m.userId,
            tripId: trip.id,
            type: "general",
            title: "New member joined!",
            message: `${ctx.user.name || "Someone"} joined your trip "${trip.name}"`,
          });
        }
      }
      return { tripId: trip.id };
    }),
  /** Turning down an emailed invite, without joining. */
  declineInvite: protectedProcedure
    .input(z.object({ inviteToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await db.getTripInviteByToken(input.inviteToken);
      if (!invite)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found.",
        });
      await db.setInviteStatus(invite.id, "declined");
      await db.recordActivity({
        tripId: invite.tripId,
        actorUserId: ctx.user.id,
        action: "member.declined",
        entityType: "invite",
        entityId: invite.id,
      });
      return { success: true };
    }),
  members: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await tripRoleOf(input.tripId, ctx.user.id);
      const members = await db.getTripMembers(input.tripId);
      return projectMembersForRole(members, role);
    }),
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        userId: z.number(),
        role: roleInput,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      if (input.userId === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "You can't change your own role. Ask another admin to do it.",
        });
      const target = await db.getTripMember(input.tripId, input.userId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found.",
        });
      // Demoting the last admin would leave a trip nobody can administer.
      if (target.role === "admin" && input.role !== "admin") {
        const admins = await db.countTripAdmins(input.tripId);
        if (admins <= 1)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This is the trip's only admin. Make someone else an admin first.",
          });
      }
      await db.updateMemberRole(input.tripId, input.userId, input.role);
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "member.role_changed",
        entityType: "member",
        entityId: input.userId,
        metadata: { from: target.role, to: input.role },
      });
      return { success: true };
    }),
  removeMember: protectedProcedure
    .input(z.object({ tripId: z.number(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      const target = await db.getTripMember(input.tripId, input.userId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found.",
        });
      if (target.role === "admin") {
        const admins = await db.countTripAdmins(input.tripId);
        if (admins <= 1)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This is the trip's only admin. Make someone else an admin first.",
          });
      }
      await db.removeTripMember(input.tripId, input.userId);
      // Their attendee row goes with them: leaving it behind would keep them in
      // the headcount and in every per-person figure derived from it.
      await db.deleteMemberAttendee(input.tripId, input.userId);
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "member.removed",
        entityType: "member",
        entityId: input.userId,
      });
      return { success: true };
    }),
  updateMemberBudget: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        budgetMax: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await requireTripRole(
        input.tripId,
        ctx.user.id,
        "tripmate"
      );
      // A cap belongs to whatever is being charged. In a group that is the
      // group — one household, one wallet — and setting a personal one there
      // would be a number nothing reads.
      if (member.groupId != null) {
        await db.updateTripGroup(member.groupId, {
          budgetMax: input.budgetMax,
        });
        return { success: true, appliedTo: "group" as const };
      }
      await db.updateMemberBudget(input.tripId, ctx.user.id, input.budgetMax);
      return { success: true, appliedTo: "member" as const };
    }),
});
