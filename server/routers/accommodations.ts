/**
 * Stay proposals, voting, URL import, and AI match analysis.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "../_core/llm.js";
import { logger } from "../_core/logger.js";
import * as db from "../db.js";
import {
  extractLLMText,
  requireTripRole,
  tripRoleOf,
  projectProposalsForRole,
} from "./_shared.js";
import {
  runAccommodationMatchAnalysis,
  runTripMatchAnalyses,
} from "./matchAnalysis.js";
import {
  cleanListingUrl,
  coerceExtractedAccommodation,
} from "../utils/listingPage.js";
import { resolveListingSource } from "../utils/listingSource.js";

const log = logger.child({ scope: "accommodations" });

/**
 * Analyses currently in flight, so a second click cannot spend a second model
 * call on the same thing.
 *
 * In-process, and therefore per-instance: on a serverless platform two
 * concurrent requests can land on different instances and both proceed. That is
 * accepted — the guard is here to stop an impatient double-click, not to be a
 * distributed lock. A real one would need a row and is not worth it for a
 * duplicate analysis that overwrites itself with the same answer.
 */
const analysesRunning = new Set<string | number>();
const tripKey = (tripId: number) => `trip:${tripId}`;
const isAnalysisRunning = (key: string | number) => analysesRunning.has(key);
const markAnalysisRunning = (key: string | number) => analysesRunning.add(key);
const markAnalysisDone = (key: string | number) => analysesRunning.delete(key);

/** Gemini honours `json_object` but still fences the odd reply; take the object either way. */
function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}

export const accommodationsRouter = router({
  list: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await tripRoleOf(input.tripId, ctx.user.id);
      const accommodations = await db.getAccommodations(input.tripId);
      return projectProposalsForRole(accommodations, role);
    }),
  create: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        name: z.string().min(1),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        pricePerNight: z.string().optional(),
        totalPrice: z.string().optional(),
        bedrooms: z.number().optional(),
        bathrooms: z.number().optional(),
        singleBeds: z.number().optional(),
        doubleBeds: z.number().optional(),
        toilets: z.number().optional(),
        ensuites: z.number().optional(),
        freeParking: z.boolean().optional(),
        camperParking: z.boolean().optional(),
        amenities: z.string().optional(),
        preferences: z.string().optional(),
        location: z.string().optional(),
        link: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      const normalize = (s: string | undefined) =>
        (s || "").trim().toLowerCase();
      const existingAccs = await db.getAccommodations(input.tripId);
      const dupAcc = existingAccs.find(
        a =>
          normalize(a.name) === normalize(input.name) &&
          normalize(a.description ?? undefined) ===
            normalize(input.description) &&
          normalize(a.location ?? undefined) === normalize(input.location) &&
          normalize(a.link ?? undefined) === normalize(input.link)
      );
      if (dupAcc)
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "An identical accommodation already exists. Please change at least one field.",
        });
      // Calculate per-person cost
      const members = await db.getTripMembers(input.tripId);
      const memberCount =
        members.filter(m => m.status === "accepted").length || 1;
      const perPersonCost = input.totalPrice
        ? (parseFloat(input.totalPrice) / memberCount).toFixed(2)
        : undefined;
      const id = await db.createAccommodation({
        ...input,
        perPersonCost,
        proposedBy: ctx.user.id,
      });
      // Proposing is itself a vote — nobody adds a stay they are against.
      await db.voteAccommodation({
        accommodationId: id,
        userId: ctx.user.id,
        vote: "love",
      });
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.created",
        entityType: "accommodation",
        entityId: id,
        metadata: { name: input.name },
      });
      // Adding a stay counted as a vote a few lines up; record it, or the trail
      // shows a later `vote.changed` with no vote before it.
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "vote.cast",
        entityType: "accommodation",
        entityId: id,
        metadata: { vote: "love", implicit: true },
      });
      for (const m of members) {
        if (m.userId !== ctx.user.id && m.role !== "watcher") {
          await db.createNotification({
            userId: m.userId,
            tripId: input.tripId,
            type: "vote_request",
            title: "New accommodation option!",
            message: `${ctx.user.name || "Someone"} added ${input.name}. Check it out and vote!`,
          });
        }
      }
      // No AI here. Analysis is an admin action — see `refreshMatch` and
      // `analyseAll`. Adding a stay used to spend a model call on the spot,
      // usually before anyone had set the preferences it scores against.
      return { id };
    }),
  vote: protectedProcedure
    .input(
      z.object({
        accommodationId: z.number(),
        vote: z.enum(["love", "fine", "veto"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accommodation = await db.getAccommodation(input.accommodationId);
      if (!accommodation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Accommodation not found.",
        });
      await requireTripRole(accommodation.tripId, ctx.user.id, "tripmate");
      const had = await db.getMyAccommodationVote(
        input.accommodationId,
        ctx.user.id
      );
      await db.voteAccommodation({
        accommodationId: input.accommodationId,
        userId: ctx.user.id,
        vote: input.vote,
      });
      await db.recordActivity({
        tripId: accommodation.tripId,
        actorUserId: ctx.user.id,
        action: had ? "vote.changed" : "vote.cast",
        entityType: "accommodation",
        entityId: input.accommodationId,
        metadata: { vote: input.vote, from: had?.vote ?? null },
      });
      return { success: true };
    }),
  unvote: protectedProcedure
    .input(
      z.object({
        accommodationId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accommodation = await db.getAccommodation(input.accommodationId);
      if (!accommodation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Accommodation not found.",
        });
      await requireTripRole(accommodation.tripId, ctx.user.id, "tripmate");
      await db.unvoteAccommodation(input.accommodationId, ctx.user.id);
      await db.recordActivity({
        tripId: accommodation.tripId,
        actorUserId: ctx.user.id,
        action: "vote.withdrawn",
        entityType: "accommodation",
        entityId: input.accommodationId,
      });
      return { success: true };
    }),
  /**
   * Finalise or un-finalise one accommodation. Several can be finalised at
   * once — a two-stop trip books two places to sleep.
   */
  setLock: protectedProcedure
    .input(z.object({ accommodationId: z.number(), locked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const accommodation = await db.getAccommodation(input.accommodationId);
      if (!accommodation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Accommodation not found.",
        });
      await requireTripRole(accommodation.tripId, ctx.user.id, "admin");
      await db.setAccommodationLock(
        input.accommodationId,
        input.locked,
        ctx.user.id
      );
      await db.recordActivity({
        tripId: accommodation.tripId,
        actorUserId: ctx.user.id,
        action: input.locked ? "proposal.locked" : "proposal.unlocked",
        entityType: "accommodation",
        entityId: input.accommodationId,
        metadata: { name: accommodation.name },
      });
      return { success: true };
    }),
  /** Clear every finalised accommodation on the trip. */
  unlockAll: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      await db.unlockAccommodations(input.tripId);
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.unlocked",
        entityType: "accommodation",
      });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const accommodation = await db.getAccommodation(input.id);
      if (!accommodation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Accommodation not found.",
        });
      await requireTripRole(accommodation.tripId, ctx.user.id, "tripmate");
      const isAdmin = await db.isTripAdmin(accommodation.tripId, ctx.user.id);
      if (accommodation.proposedBy !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the person who proposed this, or an admin, can remove it.",
        });
      await db.recordActivity({
        tripId: accommodation.tripId,
        actorUserId: ctx.user.id,
        action: "proposal.deleted",
        entityType: "accommodation",
        entityId: input.id,
        metadata: { name: accommodation.name },
      });
      await db.deleteAccommodation(input.id);
      return { success: true };
    }),
  edit: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        imageUrl: z.string().optional(),
        pricePerNight: z.string().optional(),
        totalPrice: z.string().optional(),
        location: z.string().optional(),
        link: z.string().optional(),
        bedrooms: z.number().optional(),
        bathrooms: z.number().optional(),
        singleBeds: z.number().optional(),
        doubleBeds: z.number().optional(),
        freeParking: z.boolean().optional(),
        amenities: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accommodation = await db.getAccommodation(input.id);
      if (!accommodation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Accommodation not found.",
        });
      await requireTripRole(accommodation.tripId, ctx.user.id, "tripmate");
      const isAdmin = await db.isTripAdmin(accommodation.tripId, ctx.user.id);
      if (accommodation.proposedBy !== ctx.user.id && !isAdmin)
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Only the person who proposed this, or an admin, can edit it.",
        });
      const { id, ...data } = input;
      await db.updateAccommodation(id, data);
      return { success: true };
    }),
  refreshMatch: protectedProcedure
    .input(z.object({ accommodationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const accommodation = await db.getAccommodation(input.accommodationId);
      if (!accommodation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Accommodation not found.",
        });
      // The trip comes from the row, not from the caller. It used to be a
      // client-supplied `tripId` that was never checked against the
      // accommodation, so the role check could be passed using a trip you
      // administer while analysing a stay belonging to one you don't.
      const { tripId } = accommodation;
      await requireTripRole(tripId, ctx.user.id, "admin");

      if (isAnalysisRunning(input.accommodationId))
        throw new TRPCError({
          code: "CONFLICT",
          message: "That analysis is already running. Give it a moment.",
        });
      markAnalysisRunning(input.accommodationId);
      try {
        await db.recordActivity({
          tripId,
          actorUserId: ctx.user.id,
          action: "ai.match_refreshed",
          entityType: "accommodation",
          entityId: input.accommodationId,
        });
        await runAccommodationMatchAnalysis(input.accommodationId, tripId);
      } finally {
        markAnalysisDone(input.accommodationId);
      }
      return { success: true };
    }),
  /**
   * The deliberate version of what saving preferences used to do by accident:
   * one pass over the trip's accommodations, at a moment a person chose.
   */
  analyseAll: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      if (isAnalysisRunning(tripKey(input.tripId)))
        throw new TRPCError({
          code: "CONFLICT",
          message: "An analysis of this trip is already running.",
        });
      markAnalysisRunning(tripKey(input.tripId));
      try {
        await db.recordActivity({
          tripId: input.tripId,
          actorUserId: ctx.user.id,
          action: "ai.match_refreshed",
          entityType: "trip",
          entityId: input.tripId,
          metadata: { scope: "all" },
        });
        const analysed = await runTripMatchAnalyses(input.tripId);
        return { analysed };
      } finally {
        markAnalysisDone(tripKey(input.tripId));
      }
    }),

  clone: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const accommodation = await db.getAccommodation(input.id);
      if (!accommodation)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Accommodation not found.",
        });
      await requireTripRole(accommodation.tripId, ctx.user.id, "tripmate");
      const newId = await db.createAccommodation({
        tripId: accommodation.tripId,
        proposedBy: ctx.user.id,
        name: `${accommodation.name} (copy)`,
        description: accommodation.description ?? undefined,
        imageUrl: accommodation.imageUrl ?? undefined,
        pricePerNight: accommodation.pricePerNight ?? undefined,
        totalPrice: accommodation.totalPrice ?? undefined,
        location: accommodation.location ?? undefined,
        link: accommodation.link ?? undefined,
        bedrooms: accommodation.bedrooms ?? undefined,
        bathrooms: accommodation.bathrooms ?? undefined,
        singleBeds: accommodation.singleBeds ?? undefined,
        doubleBeds: accommodation.doubleBeds ?? undefined,
        freeParking: accommodation.freeParking ?? undefined,
        amenities: accommodation.amenities ?? undefined,
      });
      await db.voteAccommodation({
        accommodationId: newId,
        userId: ctx.user.id,
        vote: "love",
      });
      return { id: newId };
    }),
  fetchFromUrl: protectedProcedure
    .input(
      z.object({
        url: z.string().url(),
        /**
         * The page as the member's own browser rendered it, pasted in after we
         * were refused. Their request is not the one the site blocked, so this
         * is the only path that ever sees a price on Booking.com.
         */
        pageText: z.string().max(400_000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const url = input.url.trim();

      // Every way of getting at the page, in order, behind one call —
      // see server/utils/listingSource.ts and ADR-0008/ADR-0013.
      const {
        resolvedUrl,
        facts,
        pastedText,
        hints,
        place,
        blocked,
        usable,
        source,
      } = await resolveListingSource({
        url,
        ...(input.pageText ? { pageText: input.pageText } : {}),
      });

      if (!usable) return { success: false, data: {}, source, blocked };

      try {
        const context = JSON.stringify({
          url: cleanListingUrl(resolvedUrl),
          page: facts ?? null,
          pageText: pastedText || null,
          urlHints: hints,
          place,
        }).slice(0, 24_000);

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You extract accommodation details for a trip-planning form.

You are given "page" (metadata the listing published, or null when the site refused our request), "pageText" (the listing page as the traveller copied it out of their own browser, or null — noisy, but it is the real page and the only source that carries the price for these dates), "urlHints" (what the URL itself encodes: property slug, ISO 3166-1 country code, stay dates, guest counts), and "place" (a map lookup of that slug, or null — it knows the property's real name and postal address and nothing about this stay).

RULES:
- Use ONLY the supplied data. Never invent a price, a rating, a bed count or a city.
- "pageText" outranks everything else when present: it is what the traveller is looking at. Read the price they were quoted, the room and bed counts, the address and the amenities out of it, and ignore the site's navigation, footer and unrelated properties around them.
- When "page" and "pageText" are both null, still return what the URL supports: "slug" is the property name (tidy the capitalisation), "countryCode" gives the country (expand the ISO code, e.g. "si" is Slovenia) — and nothing else.
- When "place" is present it is the better name and location than the slug: use "place.name" for name and shorten "place.address" to a town and country for location. It never carries a price, a bed count or an amenity — leave those null.
- Titles often carry trailing site furniture ("… — Updated 2026 Prices", "| Booking.com"). Strip it from name; keep the town or city for location.
- location is a place ("Ljubljana, Slovenia"), not a full postal address, unless only an address is given.
- Prices are plain numbers in the listing's own currency, no symbols or thousands separators. If a price covers the whole stay it is totalPrice, not pricePerNight; urlHints.nights tells you the stay length.
- amenities: only features the page actually names.

Return ONLY JSON with these fields, null for anything unknown: name, description, location, pricePerNight, totalPrice, bedrooms, bathrooms, singleBeds, doubleBeds, toilets, ensuites, freeParking, camperParking, amenities (string array), imageUrl.`,
            },
            {
              role: "user",
              content: `${context}\n\nReturn JSON only, no markdown.`,
            },
          ],
          responseFormat: { type: "json_object" },
        });

        const data = coerceExtractedAccommodation(
          parseJsonObject(extractLLMText(response, "{}")),
          resolvedUrl
        );
        // The page's own image beats whatever the model echoed back.
        if (facts?.imageUrl) data.imageUrl = facts.imageUrl;
        return {
          success: Object.keys(data).length > 0,
          data,
          source,
          blocked,
        };
      } catch (err) {
        log.warn("accommodation URL extraction failed", { err });
        return { success: false, data: {}, source: "none" as const, blocked };
      }
    }),
  parseAttributes: protectedProcedure
    .input(z.object({ text: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an accommodation attributes extractor. Given a natural language description of accommodation preferences/requirements, extract structured attributes. Return ONLY JSON with any relevant fields from this list (omit unknown ones): singleBeds (int), doubleBeds (int), bedrooms (int), bathrooms (int), toilets (int, standalone toilets), ensuites (int, toilet+shower combined), freeParking (boolean), camperParking (boolean), amenities (string array of extra features like WiFi, Pool, Kitchen, Microwave, Washing Machine, Dryer, Air conditioning, Heating, TV, Dishwasher, BBQ, etc.). Be smart and infer from context.`,
            },
            {
              role: "user",
              content: `Parse these accommodation preferences: "${input.text}"\n\nReturn JSON only, no markdown.`,
            },
          ],
          responseFormat: { type: "json_object" },
        });
        const data = coerceExtractedAccommodation(
          parseJsonObject(extractLLMText(response, "{}"))
        );
        return { success: Object.keys(data).length > 0, data };
      } catch (err) {
        log.warn("accommodation preference parsing failed", { err });
        return { success: false, data: {} };
      }
    }),
});
