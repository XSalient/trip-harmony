/**
 * Per-member, per-trip requirements used by match analysis.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import * as db from "../db.js";
import { runTripMatchAnalyses } from "./matchAnalysis.js";
import { requireTripRole } from "./_shared.js";

export const preferencesRouter = router({
  getMy: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "watcher");
      return db.getMyTripPreferences(input.tripId, ctx.user.id);
    }),
  save: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        mustHaves: z.string().max(2000),
        strongPreferences: z.string().max(2000),
        avoids: z.string().max(2000),
        openComments: z.string().max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      await db.saveTripPreferences({
        tripId: input.tripId,
        userId: ctx.user.id,
        mustHaves: input.mustHaves,
        strongPreferences: input.strongPreferences,
        avoids: input.avoids,
        openComments: input.openComments,
      });
      // Re-run AI match analysis for all accommodations in this trip (non-blocking)
      runTripMatchAnalyses(input.tripId).catch(() => {});
      return { success: true };
    }),
  countForTrip: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "watcher");
      const count = await db.countTripPreferences(input.tripId);
      return { count };
    }),
});
