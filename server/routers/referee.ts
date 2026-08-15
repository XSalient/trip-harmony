/**
 * AI mediation: conflict detection and compromise suggestions.
 *
 * The prompt, and the facts the referee is allowed to reason about, live in
 * `server/prompts/referee.ts` — versioned and tested there without a model.
 * What is left here is the endpoint: who may ask, how often, and what is said
 * when the model does not answer.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { invokeLLM } from "../_core/llm.js";
import { config } from "../_core/env.js";
import { logger } from "../_core/logger.js";
import * as db from "../db.js";
import { extractLLMText, requireTripRole } from "./_shared.js";
import {
  buildRefereeContext,
  buildRefereePrompt,
  refereeUnavailableMessage,
  type RefereeUnavailableReason,
} from "../prompts/referee.js";
import {
  REFEREE_COOLDOWN_MS,
  refereeCooldownRemainingMs,
} from "../../shared/const.js";

const log = logger.child({ scope: "referee" });

/**
 * What a run that never happened returns.
 *
 * Deliberately not stored. The cooldown is the age of the newest stored
 * message, so persisting a failure would lock the button for ten minutes over
 * an outage that might last seconds — and would leave "Analysis unavailable"
 * sitting in the feed as the group's most recent read. `retryAfterMs: 0` says
 * the same thing to the button: try again whenever you like.
 */
function unavailable(reason: RefereeUnavailableReason) {
  return {
    id: null as number | null,
    content: refereeUnavailableMessage(reason),
    fromCooldown: false,
    analysisUnavailable: true,
    retryAfterMs: 0,
  };
}

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

      // Inside the cooldown, hand back what the referee already said rather
      // than erroring. Nothing has changed enough in ten minutes to be worth
      // another pass over every member's preferences and every vote, and a
      // refused button reads as a broken one.
      const recent = await db.getRefereeMessages(input.tripId, 1);
      const last = recent[0];
      const retryAfterMs = refereeCooldownRemainingMs(last?.createdAt);
      if (last && retryAfterMs > 0) {
        return {
          id: last.id as number | null,
          content: last.content,
          fromCooldown: true,
          analysisUnavailable: false,
          retryAfterMs,
        };
      }

      // Checked before the trip is read, so a deployment with no key says so
      // instead of spending seven queries to reach a failure it already knew
      // about. `accommodations.fetchFromUrl` learned this the same way.
      if (!config.ai.isConfigured) {
        log.warn("referee asked for with no AI provider configured", {
          tripId: input.tripId,
        });
        return unavailable("no-provider");
      }

      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "ai.referee_run",
        entityType: "trip",
        entityId: input.tripId,
      });
      // Recorded where the run is decided on, so the count is runs that
      // actually reached the model — a cooldown hit and a missing provider
      // both return above this line. A run that the model then fails still
      // counts; the runbook says so.
      await db.recordProductEvent({
        event: "referee.run",
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        metadata: { phase: input.phase },
      });

      const [
        trip,
        members,
        allPrefs,
        budgetProposals,
        headcount,
        dateProposals,
        destinations,
        accommodations,
      ] = await Promise.all([
        db.getTrip(input.tripId),
        db.getTripMembers(input.tripId),
        db.getAllTripPreferences(input.tripId),
        db.getBudgetProposals(input.tripId),
        db.getTripHeadcount(input.tripId),
        db.getDateProposals(input.tripId),
        db.getDestinations(input.tripId),
        db.getAccommodations(input.tripId),
      ]);

      const context = buildRefereeContext({
        trip,
        phase: input.phase,
        members,
        preferences: allPrefs,
        budgetProposals,
        headcount,
        dateProposals,
        destinations,
        accommodations,
      });
      const prompt = buildRefereePrompt(context);
      // Carries `promptVersion`, so a stored message can always be traced back
      // to the wording that produced it.
      const contextJson = JSON.stringify(context);

      try {
        const response = await invokeLLM({
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
        });

        const content = extractLLMText(response).trim();
        // An empty completion is a failed call that happens to have returned
        // 200. Storing it would put a blank card in the feed and start the
        // cooldown on nothing.
        if (!content) {
          log.warn("referee model returned no text", {
            tripId: input.tripId,
            promptVersion: context.promptVersion,
          });
          return unavailable("model-error");
        }

        const msgId = await db.createRefereeMessage({
          tripId: input.tripId,
          phase: input.phase,
          messageType: "mediation",
          content,
          context: contextJson,
        });

        return {
          id: msgId as number | null,
          content,
          fromCooldown: false,
          analysisUnavailable: false,
          retryAfterMs: REFEREE_COOLDOWN_MS,
        };
      } catch (error) {
        // This used to be swallowed, and answered with an encouraging nudge —
        // so a broken model call and a trip in perfect harmony read identically
        // to the group, and left no trace for anyone debugging it.
        log.error("referee analysis failed", {
          tripId: input.tripId,
          promptVersion: context.promptVersion,
          err: error,
        });
        return unavailable("model-error");
      }
    }),
});
