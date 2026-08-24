/**
 * Turning what somebody wrote in My Preferences into proposals they can put to
 * the group.
 *
 * Its own domain rather than a corner of `preferences.ts`, for two reasons.
 * It emits proposals across three of them — dates, budget, and later places —
 * so preferences would end up owning rules that are not its own. And
 * `aiLimits.test.ts` asserts that `preferences.ts` contains no model call at
 * all, which is the guarantee that saving a form never quietly spends money;
 * the eventual "look harder" pass belongs behind an explicit tap, here, where
 * that rule can be stated for this file separately.
 *
 * Nothing in this file writes a proposal. It answers "what could you propose",
 * and the existing `dates.propose` / `budget.create` do the rest — so a
 * converted preference is an ordinary proposal, with the implicit vote and the
 * notification those already handle, rather than a second way in.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import * as db from "../db.js";
import {
  budgetFingerprint,
  capSuggestion,
  dateFingerprint,
  detectSuggestions,
  suppress,
} from "../../shared/suggestions.js";
import { BUDGET_SCOPES, type BudgetScope } from "../../shared/budget.js";
import { requireTripRole } from "./_shared.js";

export const suggestionsRouter = router({
  /**
   * What this person could propose, given what they have written.
   *
   * A query rather than a mutation: it writes nothing, and the screen asks for
   * it again after every save. Tripmate and above, because a watcher has no
   * requirements to state and cannot propose anything anyway.
   */
  fromPreferences: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const me = await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const [saved, trip, dismissed, dateProposals, budgetProposals] =
        await Promise.all([
          db.getMyTripPreferences(input.tripId, ctx.user.id),
          db.getTrip(input.tripId),
          db.getDismissedSuggestions(input.tripId, ctx.user.id),
          db.getDateProposals(input.tripId),
          db.getBudgetProposals(input.tripId),
        ]);

      const currency = trip?.currency || "USD";
      const found = detectSuggestions(
        {
          mustHaves: saved?.mustHaves ?? "",
          strongPreferences: saved?.strongPreferences ?? "",
          avoids: saved?.avoids ?? "",
          openComments: saved?.openComments ?? "",
        },
        { currency }
      );

      // The cap is the one figure people give that never reaches the group.
      const cap = capSuggestion(me.budgetMax, {
        currency,
        inGroup: me.groupId != null,
      });
      if (cap) found.push(cap);

      // Anything already proposed on this trip — by anyone. Somebody else
      // having proposed your figure already is the same answer as you having
      // proposed it: there is nothing left to offer.
      const existing = [
        ...dateProposals.map(p => dateFingerprint(p.startDate, p.endDate)),
        ...budgetProposals.map(p =>
          budgetFingerprint(String(p.amount), p.scope as BudgetScope)
        ),
      ];

      return { suggestions: suppress(found, existing, dismissed) };
    }),

  /**
   * "No thanks." Remembered, or the same card returns on every save.
   *
   * Accepting one needs no equivalent: it becomes a proposal, and the
   * proposal's own fingerprint is what stops it being offered again.
   */
  dismiss: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        kind: z.enum(["date", "budget"]),
        fingerprint: z.string().max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      await db.dismissSuggestion({
        tripId: input.tripId,
        userId: ctx.user.id,
        kind: input.kind,
        fingerprint: input.fingerprint,
      });
      return { success: true };
    }),
});

/** Re-exported so the router file is the one import a caller needs. */
export { BUDGET_SCOPES };
