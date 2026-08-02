/**
 * AI mediation: conflict detection and compromise suggestions.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { invokeLLM } from "../_core/llm.js";
import * as db from "../db.js";
import { extractLLMText, requireTripRole } from "./_shared.js";

export const refereeRouter = router({
  messages: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Referee messages summarise the group's disagreements and name members
      // and their preferences. A watcher who cannot see who voted has no
      // business reading a summary of the argument.
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      return db.getRefereeMessages(input.tripId);
    }),
  analyze: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        phase: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      const trip = await db.getTrip(input.tripId);
      const members = await db.getTripMembers(input.tripId);
      const allPrefs = await db.getAllTripPreferences(input.tripId);
      const budgetItems = await db.getBudgetItems(input.tripId);
      const dateProposals = await db.getDateProposals(input.tripId);
      const destinations = await db.getDestinations(input.tripId);
      const accommodations = await db.getAccommodations(input.tripId);

      const totalBudget = budgetItems.reduce(
        (s, i) => s + parseFloat(i.amount as string),
        0
      );
      const accepted = members.filter(m => m.status === "accepted");
      const memberCount = accepted.length;

      const nameOf = (userId: number) =>
        accepted.find(m => m.userId === userId)?.user?.name ||
        `Member #${userId}`;

      // Each preference field accepts 2,000 characters, so a large group can
      // outgrow a sensible prompt on its own. Trim per field rather than
      // slicing the finished JSON, which would hand the model a broken object.
      const trim = (s: string | undefined) =>
        s ? (s.length > 400 ? `${s.slice(0, 400)}…` : s) : null;

      // What each member said they need. This is the trip-specific signal the
      // referee reasons about — generic personality scores never told it which
      // proposal was the problem.
      const preferences = accepted.map(m => {
        const row = allPrefs.find(p => p.userId === m.userId);
        let parsed: Record<string, string> | null = null;
        try {
          if (row) parsed = JSON.parse(row.rawText);
        } catch {}
        return {
          name: m.user?.name || `Member #${m.userId}`,
          mustHaves: trim(parsed?.mustHaves),
          avoids: trim(parsed?.avoids),
          comments: trim(parsed?.openComments),
        };
      });

      /**
       * A proposal's disagreement, in the shape the referee can act on: how the
       * group split, and who still owes a vote. An option nobody has voted on
       * is a different problem from one the group is split over, and the
       * referee has to be able to tell them apart.
       */
      const summariseVotes = (
        label: string,
        votes: Array<{ userId: number; vote: string }> | undefined
      ) => {
        const cast = votes ?? [];
        const tally: Record<string, number> = {};
        for (const v of cast) tally[v.vote] = (tally[v.vote] ?? 0) + 1;
        const votedIds = new Set(cast.map(v => v.userId));
        return {
          label,
          votes: tally,
          notVoted: accepted
            .filter(m => !votedIds.has(m.userId))
            .map(m => nameOf(m.userId)),
        };
      };

      const contextSummary = JSON.stringify({
        tripName: trip?.name,
        phase: input.phase,
        memberCount,
        preferences,
        totalBudget,
        perPerson: memberCount > 0 ? (totalBudget / memberCount).toFixed(2) : 0,
        dates: dateProposals.map((p: any) =>
          summariseVotes(p.label || "Untitled dates", p.votes)
        ),
        destinations: destinations.map((d: any) =>
          summariseVotes(d.name, d.votes)
        ),
        accommodations: accommodations.map((a: any) =>
          summariseVotes(a.name, a.votes)
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
              content: `Analyze this group trip situation and provide mediation advice.

"preferences" is what each member said they need for this trip. Each entry under "dates", "destinations" and "accommodations" is one proposal: "votes" tallies how the group voted on it, and "notVoted" names the members who have not voted on it yet.

${contextSummary}

Provide: 1) A brief status assessment, 2) Any detected conflicts or tension points, 3) A specific compromise suggestion if needed, 4) An encouraging next step.

Name the actual proposals and people involved — "Barcelona has two vetoes" or "the beach house clashes with Sam's no-stairs must-have", never "there is some disagreement". If the real blocker is that nobody has voted yet, say so and name who is holding it up.`,
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
