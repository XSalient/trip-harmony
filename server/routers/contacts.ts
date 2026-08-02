/**
 * A user's private address book, so a friend's email is typed once ever.
 *
 * Saving a contact grants nothing. Inviting one still sends an email and still
 * waits for them to accept — the alternative would be a way to add people to
 * trips without their agreement.
 */
import { protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import * as db from "../db.js";

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
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Scoped by owner in the query itself: one user must never be able to
      // delete another's contact by guessing an id.
      await db.deleteContact(input.id, ctx.user.id);
      return { success: true };
    }),
});
