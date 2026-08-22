/**
 * Date-range proposals, voting, and natural-language date parsing.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { logger } from "../_core/logger.js";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm.js";
import * as db from "../db.js";
import {
  extractLLMText,
  requireTripRole,
  tripRoleOf,
  projectProposalsForRole,
} from "./_shared.js";

const log = logger.child({ scope: "dates" });

export const datesRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await tripRoleOf(input.tripId, ctx.user.id);
      const proposals = await db.getDateProposals(input.tripId);
      return projectProposalsForRole(proposals, role);
    }),
  propose: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        startDate: z.string(),
        endDate: z.string(),
        label: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const normalizeDate = (d: string | Date) =>
        new Date(d).toISOString().split("T")[0];
      const existing = await db.getDateProposals(input.tripId);
      const duplicate = existing.find(
        p =>
          normalizeDate(p.startDate) === normalizeDate(input.startDate) &&
          normalizeDate(p.endDate) === normalizeDate(input.endDate)
      );
      if (duplicate)
        throw new TRPCError({
          code: "CONFLICT",
          message: "A proposal with these exact dates already exists.",
        });
      const id = await db.createDateProposal({
        tripId: input.tripId,
        proposedBy: ctx.user.id,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        label: input.label,
      });
      // Proposing dates says you can make them — record it as the first vote.
      await db.applyGroupVoteExclusivity("date", id, input.tripId, ctx.user.id);
      await db.voteDateProposal({
        proposalId: id,
        userId: ctx.user.id,
        vote: "available",
      });
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.created",
        entityType: "date",
        entityId: id,
        metadata: { label: input.label },
      });
      // Proposing counted as a vote a few lines up; record it, or the trail
      // shows a later `vote.changed` with no vote before it.
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "vote.cast",
        entityType: "date",
        entityId: id,
        metadata: { vote: "available", implicit: true },
      });
      // Notify members. Watchers opted out of trip updates by being watchers.
      const members = await db.getTripMembers(input.tripId);
      for (const m of members) {
        if (m.userId !== ctx.user.id && m.role !== "watcher") {
          await db.createNotification({
            userId: m.userId,
            tripId: input.tripId,
            type: "vote_request",
            title: "New date proposed!",
            message: `${ctx.user.name || "Someone"} proposed new dates. Cast your vote!`,
          });
        }
      }
      return { id };
    }),
  vote: protectedProcedure
    .input(
      z.object({
        proposalId: z.number(),
        vote: z.enum(["available", "maybe", "unavailable"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await db.getDateProposal(input.proposalId);
      if (!proposal)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Proposal not found.",
        });
      await requireTripRole(proposal.tripId, ctx.user.id, "tripmate");
      const had = await db.getMyDateVote(input.proposalId, ctx.user.id);
      // One vote per group when the trip votes that way: a groupmate's vote on
      // this proposal is replaced, not added to. Enforced here, before every
      // write, so every tally downstream counts rows that are already one per
      // group. See docs/adr/0016-one-vote-per-group.md.
      const displaced = await db.applyGroupVoteExclusivity(
        "date",
        input.proposalId,
        proposal.tripId,
        ctx.user.id
      );
      await db.voteDateProposal({
        proposalId: input.proposalId,
        userId: ctx.user.id,
        vote: input.vote,
      });
      await db.recordActivity({
        tripId: proposal.tripId,
        actorUserId: ctx.user.id,
        action: had ? "vote.changed" : "vote.cast",
        entityType: "date",
        entityId: input.proposalId,
        metadata: { vote: input.vote, from: had?.vote ?? null },
      });
      for (const userId of displaced) {
        await db.recordActivity({
          tripId: proposal.tripId,
          actorUserId: ctx.user.id,
          action: "vote.superseded",
          entityType: "date",
          entityId: input.proposalId,
          metadata: { userId, reason: "one vote per group" },
        });
      }
      return { success: true };
    }),
  unvote: protectedProcedure
    .input(
      z.object({
        proposalId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await db.getDateProposal(input.proposalId);
      if (!proposal)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Proposal not found.",
        });
      await requireTripRole(proposal.tripId, ctx.user.id, "tripmate");
      await db.unvoteDateProposal(input.proposalId, ctx.user.id);
      await db.recordActivity({
        tripId: proposal.tripId,
        actorUserId: ctx.user.id,
        action: "vote.withdrawn",
        entityType: "date",
        entityId: input.proposalId,
      });
      return { success: true };
    }),
  /** Finalise these dates. A trip has one set, so this replaces any other. */
  lock: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        proposalId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      await db.lockDateProposal(input.tripId, input.proposalId, ctx.user.id);
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.locked",
        entityType: "date",
        entityId: input.proposalId,
      });
      return { success: true };
    }),
  unlock: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      await db.unlockDateProposals(input.tripId);
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.unlocked",
        entityType: "date",
      });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await db.getDateProposal(input.id);
      if (!proposal)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Proposal not found.",
        });
      await requireTripRole(proposal.tripId, ctx.user.id, "tripmate");
      const isAdmin = await db.isTripAdmin(proposal.tripId, ctx.user.id);
      if (proposal.proposedBy !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the person who proposed this, or an admin, can remove it.",
        });
      await db.recordActivity({
        tripId: proposal.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.deleted",
        entityType: "date",
        entityId: input.id,
        metadata: { label: proposal.label },
      });
      await db.deleteDateProposal(input.id);
      return { success: true };
    }),
  edit: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        label: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await db.getDateProposal(input.id);
      if (!proposal)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Proposal not found.",
        });
      await requireTripRole(proposal.tripId, ctx.user.id, "tripmate");
      const isAdmin = await db.isTripAdmin(proposal.tripId, ctx.user.id);
      if (proposal.proposedBy !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the person who proposed this, or an admin, can edit it.",
        });
      await db.updateDateProposal(input.id, {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.startDate ? { startDate: new Date(input.startDate) } : {}),
        ...(input.endDate ? { endDate: new Date(input.endDate) } : {}),
      });
      return { success: true };
    }),
  clone: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await db.getDateProposal(input.id);
      if (!proposal)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Proposal not found.",
        });
      await requireTripRole(proposal.tripId, ctx.user.id, "tripmate");
      const id = await db.createDateProposal({
        tripId: proposal.tripId,
        proposedBy: ctx.user.id,
        startDate: proposal.startDate,
        endDate: proposal.endDate,
        label: proposal.label ? `${proposal.label} (copy)` : undefined,
      });
      await db.applyGroupVoteExclusivity(
        "date",
        id,
        proposal.tripId,
        ctx.user.id
      );
      await db.voteDateProposal({
        proposalId: id,
        userId: ctx.user.id,
        vote: "available",
      });
      return { id };
    }),
  /**
   * Turns "any weekend in July" into date ranges. Tripmates and admins only.
   *
   * It takes the trip it is proposing into, rather than text alone, because it
   * calls a paid model: an endpoint with no trip on it is one any signed-in
   * account can run, for a trip they are not on, as often as they like.
   */
  parseNatural: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        text: z.string().min(1),
        referenceYear: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const year = input.referenceYear || today.getFullYear();
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a precise date parser for a group trip planning app. Today is ${todayStr}. Default year: ${year}.

RULES:
- "last N weekends in [month]" = the FINAL N weekends of that month (NOT past weekends relative to today)
- "first N weekends in [month]" = the FIRST N weekends
- A weekend = Saturday to Sunday (2 days)
- Use default year unless a different year is stated
- Return a raw JSON array — no markdown fences, no wrapper object, no explanation
- Max 8 proposals

EXAMPLE — "last 2 weekends in September 2026":
September 2026 weekends: Sep 5-6, Sep 12-13, Sep 19-20, Sep 26-27 → last 2 = Sep 19-20 and Sep 26-27
Output: [{"startDate":"2026-09-19","endDate":"2026-09-20","label":"Weekend Sep 19-20"},{"startDate":"2026-09-26","endDate":"2026-09-27","label":"Weekend Sep 26-27"}]`,
            },
            {
              role: "user",
              content: input.text,
            },
          ],
        });
        const raw = extractLLMText(response, "[]");
        log.debug("natural-language date parse response", {
          preview: raw.slice(0, 300),
        });
        const match = raw.match(/\[[\s\S]*\]/);
        if (!match) {
          log.warn("no JSON array found in date parse response");
          return { proposals: [] };
        }
        const proposals = JSON.parse(match[0]);
        return { proposals: Array.isArray(proposals) ? proposals : [] };
      } catch (err) {
        log.error("natural-language date parse failed", { err });
        return { proposals: [] };
      }
    }),
});
