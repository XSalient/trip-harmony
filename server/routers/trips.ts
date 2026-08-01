/**
 * Trip records, membership, invite codes and invite emails.
 */
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import * as db from "../db";
import { sendTripInviteEmail } from "../utils/mailer";

export const tripsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getUserTrips(ctx.user.id);
  }),
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return db.getTrip(input.id);
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trip = await db.getTrip(input.tripId);
      if (!trip)
        throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });
      const member = await db.getTripMember(input.tripId, ctx.user.id);
      if (!member)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this trip.",
        });
      const proto = ctx.req.get("x-forwarded-proto") || ctx.req.protocol;
      const origin = `${proto}://${ctx.req.get("host")}`;
      const inviteUrl = `${origin}/join/${trip.inviteCode}`;
      await sendTripInviteEmail(
        input.email,
        ctx.user.name || "Someone",
        trip.name,
        inviteUrl
      );
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
        role: "organizer",
        status: "accepted",
      });
      return { id: tripId, inviteCode };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
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
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.updateTrip(id, data);
      return { success: true };
    }),
  join: protectedProcedure
    .input(
      z.object({
        inviteCode: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trip = await db.getTripByInviteCode(input.inviteCode);
      if (!trip) throw new Error("Trip not found");
      await db.addTripMember({
        tripId: trip.id,
        userId: ctx.user.id,
        role: "member",
        status: "accepted",
      });
      // Notify organizer
      await db.createNotification({
        userId: trip.organizerId,
        tripId: trip.id,
        type: "general",
        title: "New member joined!",
        message: `${ctx.user.name || "Someone"} joined your trip "${trip.name}"`,
      });
      return { tripId: trip.id };
    }),
  members: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ input }) => {
      return db.getTripMembers(input.tripId);
    }),
  updateMemberBudget: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        budgetMax: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.updateMemberBudget(input.tripId, ctx.user.id, input.budgetMax);
      return { success: true };
    }),
});
