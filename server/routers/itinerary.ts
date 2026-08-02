/**
 * Day-by-day itinerary planning.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db.js";
import { requireTripRole } from "./_shared.js";

export const itineraryRouter = router({
  getDays: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "watcher");
      return db.getItineraryDays(input.tripId);
    }),
  addDay: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        date: z.string().min(1, "Date is required"),
        title: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const id = await db.createItineraryDay({
        tripId: input.tripId,
        date: input.date,
        title: input.title,
        notes: input.notes,
        sortOrder: 0,
      });
      return { id };
    }),
  updateDay: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const day = await db.getItineraryDay(input.id);
      if (!day)
        throw new TRPCError({ code: "NOT_FOUND", message: "Day not found." });
      await requireTripRole(day.tripId, ctx.user.id, "admin");
      const { id, ...data } = input;
      await db.updateItineraryDay(id, data);
      return { success: true };
    }),
  deleteDay: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const day = await db.getItineraryDay(input.id);
      if (!day)
        throw new TRPCError({ code: "NOT_FOUND", message: "Day not found." });
      await requireTripRole(day.tripId, ctx.user.id, "admin");
      await db.deleteItineraryDay(input.id);
      return { success: true };
    }),
  addItem: protectedProcedure
    .input(
      z.object({
        dayId: z.number(),
        tripId: z.number(),
        time: z.string().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        location: z.string().optional(),
        type: z
          .enum([
            "activity",
            "food",
            "transport",
            "accommodation",
            "free",
            "other",
          ])
          .optional(),
        cost: z.string().optional(),
        link: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const id = await db.addItineraryItem({
        dayId: input.dayId,
        tripId: input.tripId,
        time: input.time,
        title: input.title,
        description: input.description,
        location: input.location,
        type: input.type || "other",
        cost: input.cost,
        link: input.link,
        addedBy: ctx.user.id,
        sortOrder: 0,
      });
      return { id };
    }),
  deleteItem: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.getItineraryItem(input.id);
      if (!item)
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found." });
      await requireTripRole(item.tripId, ctx.user.id, "tripmate");
      const isAdmin = await db.isTripAdmin(item.tripId, ctx.user.id);
      if (item.addedBy !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the person who added this, or an admin, can remove it.",
        });
      await db.deleteItineraryItem(input.id);
      return { success: true };
    }),
});
