/**
 * Per-member, per-trip requirements used by match analysis.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import * as db from "../db.js";
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
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "preferences.saved",
      });
      // How many of the four boxes they filled in, never a word of what is in
      // them — this is the free-text field measurement most has to stay out of.
      const sections = [
        input.mustHaves,
        input.strongPreferences,
        input.avoids,
        input.openComments,
      ].filter(text => text.trim().length > 0).length;
      await db.recordProductEvent({
        event: "preference.saved",
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        metadata: { sections },
      });
      // Saving preferences used to re-analyse every accommodation in the trip,
      // so a six-member group filling in a form spent six full passes over the
      // same stays. The accommodations screen now marks results older than this
      // save as possibly out of date, and an admin re-runs them once.
      return { success: true };
    }),
  /**
   * When anyone last changed their preferences. The accommodations screen
   * compares it against each `matchAnalysedAt` to mark stale results.
   */
  lastUpdated: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "watcher");
      return { at: await db.getLatestPreferenceUpdate(input.tripId) };
    }),
  countForTrip: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "watcher");
      const count = await db.countTripPreferences(input.tripId);
      return { count };
    }),
});
