/**
 * The per-user travel personality profile and its group-level aggregate.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import * as db from "../db.js";

export const travelDnaRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return db.getTravelDna(ctx.user.id);
  }),
  save: protectedProcedure
    .input(
      z.object({
        budgetComfort: z.number().min(1).max(10),
        socialEnergy: z.number().min(1).max(10),
        adventureLevel: z.number().min(1).max(10),
        planningStyle: z.number().min(1).max(10),
        culturalCuriosity: z.number().min(1).max(10),
        comfortNeed: z.number().min(1).max(10),
        foodPriority: z.number().min(1).max(10),
        activityPace: z.number().min(1).max(10),
        dietaryNeeds: z.string().optional(),
        accessibilityNeeds: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return db.upsertTravelDna({ ...input, userId: ctx.user.id });
    }),
  getGroupDna: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ input }) => {
      return db.getGroupTravelDna(input.tripId);
    }),
});
