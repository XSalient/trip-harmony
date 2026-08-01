/**
 * AI mediation: conflict detection and compromise suggestions.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { invokeLLM } from "../_core/llm.js";
import * as db from "../db.js";
import { extractLLMText } from "./_shared.js";

export const refereeRouter = router({
  messages: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ input }) => {
      return db.getRefereeMessages(input.tripId);
    }),
  analyze: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        phase: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const trip = await db.getTrip(input.tripId);
      const members = await db.getTripMembers(input.tripId);
      const groupDna = await db.getGroupTravelDna(input.tripId);
      const budgetItems = await db.getBudgetItems(input.tripId);
      const destinations = await db.getDestinations(input.tripId);
      const accommodations = await db.getAccommodations(input.tripId);

      const totalBudget = budgetItems.reduce(
        (s, i) => s + parseFloat(i.amount as string),
        0
      );
      const memberCount = members.filter(m => m.status === "accepted").length;

      // Compute DNA averages and spreads
      const dnaFields = [
        "budgetComfort",
        "socialEnergy",
        "adventureLevel",
        "planningStyle",
        "culturalCuriosity",
        "comfortNeed",
        "foodPriority",
        "activityPace",
      ] as const;
      const dnaStats: Record<string, { avg: number; spread: number }> = {};
      for (const field of dnaFields) {
        const values = groupDna.map(d => d[field]);
        if (values.length > 0) {
          const avg = values.reduce((s, v) => s + v, 0) / values.length;
          const spread = Math.max(...values) - Math.min(...values);
          dnaStats[field] = { avg: Math.round(avg * 10) / 10, spread };
        }
      }

      const contextSummary = JSON.stringify({
        tripName: trip?.name,
        phase: input.phase,
        memberCount,
        dnaStats,
        totalBudget,
        perPerson: memberCount > 0 ? (totalBudget / memberCount).toFixed(2) : 0,
        destinationCount: destinations.length,
        accommodationCount: accommodations.length,
        vetoCount: destinations.reduce(
          (c, d) =>
            c + (d as any).votes?.filter((v: any) => v.vote === "veto").length,
          0
        ),
      });

      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are Back To Travelling's Active Referee — a witty, empathetic AI mediator for group trip planning. Your job is to detect tension points (budget gaps, preference conflicts, voting deadlocks) and suggest fair compromises. Be concise, warm, and occasionally funny. Keep responses under 200 words. Use emoji sparingly. Address the group directly.`,
            },
            {
              role: "user",
              content: `Analyze this group trip situation and provide mediation advice:\n\n${contextSummary}\n\nProvide: 1) A brief status assessment, 2) Any detected conflicts or tension points, 3) A specific compromise suggestion if needed, 4) An encouraging next step.`,
            },
          ],
        });

        const content = extractLLMText(response, "The referee is thinking...");

        const msgId = await db.createRefereeMessage({
          tripId: input.tripId,
          phase: input.phase,
          messageType: "mediation",
          content,
          context: contextSummary,
        });

        return { id: msgId, content };
      } catch (error) {
        const fallbackContent = `Hey team! I see you're in the ${input.phase} phase with ${memberCount} members. Keep the momentum going — every vote counts! 🎯`;
        const msgId = await db.createRefereeMessage({
          tripId: input.tripId,
          phase: input.phase,
          messageType: "nudge",
          content: fallbackContent,
        });
        return { id: msgId, content: fallbackContent };
      }
    }),
});
