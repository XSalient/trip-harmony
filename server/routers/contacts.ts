/**
 * A user's private address book, so a friend's email is typed once ever.
 *
 * Saving a contact grants nothing. Inviting one still sends an email and still
 * waits for them to accept — the alternative would be a way to add people to
 * trips without their agreement.
 */
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import * as db from "../db.js";
import { requireTripRole } from "./_shared.js";

export const contactsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.getContacts(ctx.user.id);
  }),
  add: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        email: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Link to a real account when the address has one, so the picker can say
      // "already on this trip" instead of offering a duplicate invite.
      const existingUser = await db.getUserByEmail(
        input.email.trim().toLowerCase()
      );
      const id = await db.addContact({
        ownerUserId: ctx.user.id,
        name: input.name,
        email: input.email,
        contactUserId: existingUser?.id ?? null,
      });
      return { id };
    }),
  /**
   * Saves someone you are already on a trip with.
   *
   * The book used to fill up only as a side effect of sending an email invite,
   * so the people you had actually travelled with were the ones missing from
   * it — anyone who joined by following the shared link left no trace, and
   * inviting them to the next trip meant asking for an address you had been
   * looking at all week.
   *
   * The address comes from the membership rather than from the caller, which
   * is the point: this endpoint is reachable by every tripmate, and one that
   * took an email as input would let any of them write an arbitrary address
   * into their book under a trusted-looking "add from trip" action. Tripmate
   * and above, because a watcher is never shown member emails at all
   * (`projectMembersForRole`) and must not get one back through here.
   */
  addFromTrip: protectedProcedure
    .input(z.object({ tripId: z.number(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      if (input.userId === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That's you.",
        });

      const member = await db.getTripMember(input.tripId, input.userId);
      if (!member || member.status !== "accepted")
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That person isn't on this trip.",
        });

      const user = await db.getUserById(input.userId);
      if (!user?.email)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "That member has no email address on their account, so there is nothing to save.",
        });

      const id = await db.addContact({
        ownerUserId: ctx.user.id,
        name: user.name || user.email,
        email: user.email,
        contactUserId: user.id,
      });
      return { id, name: user.name || user.email, email: user.email };
    }),
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Scoped by owner in the query itself: one user must never be able to
      // delete another's contact by guessing an id.
      await db.deleteContact(input.id, ctx.user.id);
      return { success: true };
    }),
});
