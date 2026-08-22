/**
 * Budget proposals and votes.
 *
 * Budget used to be an append-only expense journal: it recorded what had been
 * spent on a trip that had not happened, and had no way to ask the question a
 * group actually argues about — how much are we spending. It is now a proposal
 * type like any other, and this file follows `destinations.ts` deliberately, so
 * a reader who knows one knows both.
 *
 * The arithmetic lives in `shared/budget.ts`; nothing here re-derives it.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "../db.js";
import {
  BUDGET_SCOPES,
  describeAmount,
  groupShareOf,
  perGroupOf,
  perPersonOf,
  tripTotalOf,
  type BudgetScope,
} from "../../shared/budget.js";
import { canSeeMemberDetails } from "../../shared/roles.js";
import {
  requireTripRole,
  tripRoleOf,
  projectProposalsForRole,
} from "./_shared.js";

const scopeSchema = z.enum(BUDGET_SCOPES);

/** The cap that applies to a member: their group's if they are in one, else theirs. */
function resolvedCap(
  member: { groupId: number | null; budgetMax: string | null },
  groups: Array<{ id: number; budgetMax: string | null }>
): number | null {
  const groupCap =
    member.groupId != null
      ? (groups.find(g => g.id === member.groupId)?.budgetMax ?? null)
      : null;
  const raw = groupCap ?? member.budgetMax;
  return raw ? parseFloat(raw) : null;
}

export const budgetRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await tripRoleOf(input.tripId, ctx.user.id);
      const proposals = await db.getBudgetProposals(input.tripId);
      // Budget was the one section that never went through a projection, and
      // that is exactly how it ended up handing every member's cap to anyone
      // who asked. It goes through the same one as everything else now.
      return projectProposalsForRole(proposals, role);
    }),

  create: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        title: z.string().min(1).max(255),
        amount: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a number."),
        currency: z.string().length(3).optional(),
        scope: scopeSchema,
        covers: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const trip = await db.getTrip(input.tripId);
      const id = await db.createBudgetProposal({
        tripId: input.tripId,
        proposedBy: ctx.user.id,
        title: input.title.trim(),
        amount: input.amount,
        currency: input.currency ?? trip?.currency ?? "USD",
        scope: input.scope,
        covers: input.covers,
      });

      // Proposing a budget is a vote for it — count it without a second click,
      // exactly as suggesting a destination does. It goes through exclusivity
      // too, or proposing quietly overrides a groupmate's existing vote.
      await db.applyGroupVoteExclusivity(
        "budget",
        id,
        input.tripId,
        ctx.user.id
      );
      await db.voteBudgetProposal({
        proposalId: id,
        userId: ctx.user.id,
        vote: "love",
      });

      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.created",
        entityType: "budget",
        entityId: id,
        metadata: { title: input.title, scope: input.scope },
      });
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "vote.cast",
        entityType: "budget",
        entityId: id,
        metadata: { vote: "love", implicit: true },
      });

      const members = await db.getTripMembers(input.tripId);
      for (const m of members) {
        if (m.userId !== ctx.user.id && m.role !== "watcher") {
          await db.createNotification({
            userId: m.userId,
            tripId: input.tripId,
            type: "vote_request",
            title: "A budget was proposed",
            message: `${ctx.user.name || "Someone"} proposed ${describeAmount(
              parseFloat(input.amount),
              input.scope,
              input.currency ?? trip?.currency ?? "USD"
            )}. Vote now!`,
          });
        }
      }
      return { id };
    }),

  vote: protectedProcedure
    .input(
      z.object({
        proposalId: z.number(),
        vote: z.enum(["love", "fine", "veto"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await db.getBudgetProposal(input.proposalId);
      if (!proposal)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Budget not found.",
        });
      await requireTripRole(proposal.tripId, ctx.user.id, "tripmate");
      const had = await db.getMyBudgetVote(input.proposalId, ctx.user.id);
      const displaced = await db.applyGroupVoteExclusivity(
        "budget",
        input.proposalId,
        proposal.tripId,
        ctx.user.id
      );
      await db.voteBudgetProposal({
        proposalId: input.proposalId,
        userId: ctx.user.id,
        vote: input.vote,
      });
      await db.recordActivity({
        tripId: proposal.tripId,
        actorUserId: ctx.user.id,
        action: had ? "vote.changed" : "vote.cast",
        entityType: "budget",
        entityId: input.proposalId,
        metadata: { vote: input.vote, from: had?.vote ?? null },
      });
      for (const userId of displaced) {
        await db.recordActivity({
          tripId: proposal.tripId,
          actorUserId: ctx.user.id,
          action: "vote.superseded",
          entityType: "budget",
          entityId: input.proposalId,
          metadata: { userId, reason: "one vote per group" },
        });
      }
      return { success: true };
    }),

  unvote: protectedProcedure
    .input(z.object({ proposalId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await db.getBudgetProposal(input.proposalId);
      if (!proposal)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Budget not found.",
        });
      await requireTripRole(proposal.tripId, ctx.user.id, "tripmate");
      await db.unvoteBudgetProposal(input.proposalId, ctx.user.id);
      await db.recordActivity({
        tripId: proposal.tripId,
        actorUserId: ctx.user.id,
        action: "vote.withdrawn",
        entityType: "budget",
        entityId: input.proposalId,
      });
      return { success: true };
    }),

  /**
   * Finalise or un-finalise a budget. **Exactly one at a time** — a trip has
   * several destinations and several stays, but one answer to "how much".
   */
  setLock: protectedProcedure
    .input(z.object({ proposalId: z.number(), locked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await db.getBudgetProposal(input.proposalId);
      if (!proposal)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Budget not found.",
        });
      await requireTripRole(proposal.tripId, ctx.user.id, "admin");
      await db.setBudgetLock(
        proposal.tripId,
        input.proposalId,
        input.locked,
        ctx.user.id
      );
      await db.recordActivity({
        tripId: proposal.tripId,
        actorUserId: ctx.user.id,
        action: input.locked ? "proposal.locked" : "proposal.unlocked",
        entityType: "budget",
        entityId: input.proposalId,
        metadata: { title: proposal.title },
      });

      if (input.locked) {
        // Once, on finalise — not on every change, and never naming a figure
        // back to the group. The old journal alerted on every logged expense
        // and quoted the member's own ceiling in the message.
        const [members, groups, headcount] = await Promise.all([
          db.getTripMembers(proposal.tripId),
          db.getTripGroups(proposal.tripId),
          db.getTripHeadcount(proposal.tripId),
        ]);
        const total = tripTotalOf(
          parseFloat(proposal.amount as string),
          proposal.scope as BudgetScope,
          headcount
        );
        for (const m of members) {
          if (m.status !== "accepted" || m.role === "watcher") continue;
          const cap = resolvedCap(m, groups);
          if (cap == null) continue;
          const heads =
            m.groupId != null
              ? (headcount.byGroup[String(m.groupId)] ?? {
                  adults: 0,
                  children: 0,
                })
              : { adults: 1, children: 0 };
          const share = groupShareOf(
            parseFloat(proposal.amount as string),
            proposal.scope as BudgetScope,
            headcount,
            heads
          );
          if (share > cap) {
            await db.createNotification({
              userId: m.userId,
              tripId: proposal.tripId,
              type: "budget_alert",
              title: "The finalised budget is above your limit",
              message: `"${proposal.title}" works out at ${proposal.currency} ${share.toFixed(0)} for you, above the ${proposal.currency} ${cap.toFixed(0)} you set. The trip total is ${proposal.currency} ${total.toFixed(0)}.`,
            });
          }
        }
      }
      return { success: true };
    }),

  edit: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        amount: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/, "Amount must be a number.")
          .optional(),
        currency: z.string().length(3).optional(),
        scope: scopeSchema.optional(),
        covers: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const proposal = await db.getBudgetProposal(input.id);
      if (!proposal)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Budget not found.",
        });
      await requireTripRole(proposal.tripId, ctx.user.id, "tripmate");
      if (proposal.selected)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unfinalise this budget before editing it.",
        });
      const isAdmin = await db.isTripAdmin(proposal.tripId, ctx.user.id);
      if (proposal.proposedBy !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the person who proposed this, or an admin, can edit it.",
        });
      const { id, ...data } = input;
      await db.updateBudgetProposal(id, data);
      await db.recordActivity({
        tripId: proposal.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.edited",
        entityType: "budget",
        entityId: id,
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const proposal = await db.getBudgetProposal(input.id);
      if (!proposal)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Budget not found.",
        });
      await requireTripRole(proposal.tripId, ctx.user.id, "tripmate");
      if (proposal.selected)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unfinalise this budget before removing it.",
        });
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
        entityType: "budget",
        entityId: input.id,
        metadata: { title: proposal.title },
      });
      await db.deleteBudgetProposal(input.id);
      return { success: true };
    }),

  /**
   * The figures the screen and the summary card need: what is finalised, what
   * is leading, and what either costs — for the trip, per head, per family, and
   * for the caller's own group.
   */
  summary: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await tripRoleOf(input.tripId, ctx.user.id);
      const [proposals, headcount, members, groups] = await Promise.all([
        db.getBudgetProposals(input.tripId),
        db.getTripHeadcount(input.tripId),
        db.getTripMembers(input.tripId),
        db.getTripGroups(input.tripId),
      ]);

      const WEIGHTS: Record<string, number> = { love: 2, fine: 1, veto: -3 };
      const score = (p: (typeof proposals)[number]) =>
        p.votes.reduce((t, v) => t + (WEIGHTS[v.vote] ?? 0), 0);

      type Proposal = (typeof proposals)[number];
      const finalised: Proposal | null =
        proposals.find(p => p.selected) ?? null;
      const leading: Proposal | null =
        finalised ??
        [...proposals].sort((a, b) => score(b) - score(a))[0] ??
        null;

      const me = members.find(m => m.userId === ctx.user.id);
      // An ungrouped member is a group of one — the same first-class state as
      // an ungrouped attendee, not a missing value.
      const myHeads =
        me?.groupId != null
          ? (headcount.byGroup[String(me.groupId)] ?? {
              adults: 0,
              children: 0,
            })
          : { adults: 1, children: 0 };

      const figuresFor = (p: Proposal | null) => {
        if (!p) return null;
        const amount = parseFloat(p.amount as string);
        const scope = p.scope as BudgetScope;
        const tripTotal = tripTotalOf(amount, scope, headcount);
        return {
          id: p.id,
          title: p.title,
          currency: p.currency,
          amount,
          scope,
          tripTotal,
          perPerson: perPersonOf(tripTotal, headcount),
          perGroup: perGroupOf(tripTotal, headcount),
          yourGroupShare: groupShareOf(amount, scope, headcount, myHeads),
        };
      };

      // A count, never a name and never a figure: enough pressure to talk,
      // without publishing anybody's finances to the group. Watchers get none
      // of it — a cap is personal in exactly the way an email address is.
      let votersOverCap: number | null = null;
      if (canSeeMemberDetails(role) && leading) {
        const amount = parseFloat(leading.amount as string);
        const scope = leading.scope as BudgetScope;
        votersOverCap = members.filter(m => {
          if (m.status !== "accepted" || m.role === "watcher") return false;
          const cap = resolvedCap(m, groups);
          if (cap == null) return false;
          const heads =
            m.groupId != null
              ? (headcount.byGroup[String(m.groupId)] ?? {
                  adults: 0,
                  children: 0,
                })
              : { adults: 1, children: 0 };
          return groupShareOf(amount, scope, headcount, heads) > cap;
        }).length;
      }

      return {
        headcount: {
          adults: headcount.adults,
          children: headcount.children,
          pets: headcount.pets,
          people: headcount.people,
          groups: headcount.groups,
        },
        // The caller's own chargeable heads, so the screen can work out what
        // *every* proposal costs their family — not only the leading one.
        // Sending the two numbers beats sending a figure per proposal: the
        // arithmetic is in `shared/budget.ts` and both sides use that one copy.
        myHeads,
        proposalCount: proposals.length,
        finalised: figuresFor(finalised),
        leading: figuresFor(leading),
        myCap: canSeeMemberDetails(role) && me ? resolvedCap(me, groups) : null,
        myCapIsGroup: me?.groupId != null,
        votersOverCap,
      };
    }),
});
