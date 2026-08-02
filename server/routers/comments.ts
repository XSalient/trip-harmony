/**
 * Comment threads attached to any proposal type.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db.js";
import { requireTripRole } from "./_shared.js";

export const commentsRouter = router({
  countsByTrip: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "watcher");
      return db.getCommentCountsByTrip(input.tripId);
    }),
  list: protectedProcedure
    .input(
      z.object({
        proposalType: z.enum(["date", "destination", "accommodation"]),
        proposalId: z.number(),
      })
    )
    .query(async ({ input }) => {
      return db.getComments(input.proposalType, input.proposalId);
    }),
  add: protectedProcedure
    .input(
      z.object({
        proposalType: z.enum(["date", "destination", "accommodation"]),
        proposalId: z.number(),
        tripId: z.number(),
        content: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const id = await db.createComment({
        proposalType: input.proposalType,
        proposalId: input.proposalId,
        tripId: input.tripId,
        userId: ctx.user.id,
        content: input.content,
      });
      return { id };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await db.getComment(input.id);
      if (!comment)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Comment not found.",
        });
      await requireTripRole(comment.tripId, ctx.user.id, "tripmate");
      const isAdmin = await db.isTripAdmin(comment.tripId, ctx.user.id);
      if (comment.userId !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the author, or an admin, can delete a comment.",
        });
      await db.deleteComment(input.id);
      return { success: true };
    }),
});
