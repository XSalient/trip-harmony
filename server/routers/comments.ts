/**
 * Comment threads attached to any proposal type.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import * as db from "../db.js";

export const commentsRouter = router({
  countsByTrip: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ input }) => {
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
      if (!comment) throw new Error("Comment not found");
      const isOrganizer = await db.isTripOrganizer(comment.tripId, ctx.user.id);
      if (comment.userId !== ctx.user.id && !isOrganizer)
        throw new Error("Not authorized");
      await db.deleteComment(input.id);
      return { success: true };
    }),
});
