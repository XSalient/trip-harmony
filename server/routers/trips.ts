/**
 * Trip records, membership, roles, invite codes and invite emails.
 */
import { publicProcedure, protectedProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import * as db from "../db.js";
import { originOf, sendInvite } from "../utils/tripInvite.js";
import { config } from "../_core/env.js";
import { sendTripInviteEmail } from "../utils/mailer.js";
import {
  requireTripRole,
  requireTripAllowance,
  tripRoleOf,
  projectMembersForRole,
} from "./_shared.js";
import { TRIP_ROLES } from "../../shared/roles.js";
import {
  HIDEABLE_SECTION_KEYS,
  parseHiddenSections,
} from "../../shared/sections.js";

import { isDemoTrip } from "../../shared/demo.js";
import {
  INVITE_LINK_CLOSED_MESSAGE,
  inviteLinkIsOpen,
} from "../../shared/inviteLink.js";

const roleInput = z.enum(TRIP_ROLES);

/**
 * Whether two addresses are the same person, for the purpose of answering an
 * invitation.
 *
 * Case and surrounding space only. No plus-address folding and no dots-in-gmail
 * cleverness: this decides whether somebody may take a seat on a trip, and a
 * normalisation rule that is right for one provider and wrong for the next
 * would hand out seats on the strength of a guess.
 */
function sameEmail(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Tells a trip's admins something, skipping the person who caused it.
 *
 * Admins only: joining is not news the whole trip needs, and a watcher is on
 * the trip to follow the plan rather than to police its membership.
 */
async function notifyAdmins(
  tripId: number,
  exceptUserId: number,
  title: string,
  message: string
) {
  const members = await db.getTripMembers(tripId);
  for (const m of members) {
    if (m.userId === exceptUserId || m.role !== "admin") continue;
    await db.createNotification({
      userId: m.userId,
      tripId,
      type: "general",
      title,
      message,
    });
  }
}

export const tripsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const trips = await db.getUserTrips(ctx.user.id);
    // `hiddenSections` is parsed here for the same reason `get` parses it: the
    // stored blob is read in one place. The card needs it because its progress
    // ring counts only the decisions this trip is actually making.
    return trips.map(trip => ({
      ...trip,
      hiddenSections: parseHiddenSections(trip.hiddenSections),
    }));
  }),
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireTripRole(input.id, ctx.user.id, "watcher");
      const trip = await db.getTrip(input.id);
      if (!trip) return trip;
      // `voterCount` is derived once, here, rather than per screen. Two
      // derivations of one number is how one page says "2/4 voted" while the
      // next says "2/3" — and with groups there are now two right answers
      // depending on the trip's voting unit.
      //
      // `hiddenSections` is parsed here for the same reason: every screen that
      // asks whether a section is on gets an array, and the stored blob is
      // read in exactly one place.
      return {
        ...trip,
        voterCount: await db.getTripVoterCount(input.id),
        hiddenSections: parseHiddenSections(trip.hiddenSections),
      };
    }),
  /**
   * The caller's own role, so the UI knows which controls to render — and the
   * standing of their membership, so the join screen can tell somebody waiting
   * on an admin from somebody who has never asked.
   *
   * `role` is still null for anything but an accepted membership: a pending
   * request carries a role it does not have yet.
   */
  myRole: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const member = await db.getTripMember(input.tripId, ctx.user.id);
      const status = member?.status ?? null;
      if (!member || member.status !== "accepted")
        return { role: null, status };
      return { role: member.role, status };
    }),
  /**
   * The trip behind an invite link, for the screen that asks whether you want
   * to join it. Public, because that screen answers before you sign in.
   *
   * Three fields, not the row. Anybody holding a link — forwarded, guessed,
   * pasted into a group chat — used to get the whole trip back: its budget,
   * its phase, its organiser's id, which sections it had switched off. What
   * somebody needs in order to decide whether to accept is the name and the
   * description.
   */
  getByInviteCode: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const trip = await db.getTripByInviteCode(input.code);
      if (!trip) return null;
      const openToAnyone = isDemoTrip(trip.inviteCode);
      return {
        id: trip.id,
        name: trip.name,
        description: trip.description,
        // Whether this link is admitting anybody, so the screen can say so
        // before somebody taps a button that cannot work. Not *why*: which of
        // off, used up and expired it is, is the trip's business.
        linkOpen: openToAnyone || inviteLinkIsOpen(trip),
        // The seeded demo is exempt from the switch, the count and the expiry
        // alike — a sales tour has nobody to approve a prospect (`isDemoTrip`).
        openToAnyone,
      };
    }),
  sendInviteEmail: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        email: z.string().email(),
        role: roleInput.default("tripmate"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // A tripmate may bring their own family in to *watch*, but not to vote.
      // On a trip of families the person who knows who is in a household is the
      // person in it, and having to ask an admin to add your own mother is the
      // kind of friction that ends with her not being on the trip at all.
      //
      // Safe to loosen only because of what a watcher is: they change nothing,
      // and `getTripVoterCount` leaves them out of every denominator — so this
      // cannot grow the voting group behind an admin's back. Inviting anyone
      // who *can* vote stays admin-only, and so does the shared invite link,
      // which makes tripmates.
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      if (input.role !== "watcher")
        await requireTripRole(input.tripId, ctx.user.id, "admin");

      const trip = await db.getTrip(input.tripId);
      if (!trip)
        throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });

      const { delivered } = await sendInvite({
        trip,
        email: input.email,
        role: input.role,
        invitedBy: ctx.user.id,
        inviterName: ctx.user.name || "Someone",
        origin: originOf(ctx.req),
      });
      // The role, never the address. The activity trail keeps the address
      // because the members page shows it back to the group; measurement has
      // no such need, so it does not have it.
      await db.recordProductEvent({
        event: "invite.sent",
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        metadata: { role: input.role },
      });
      // `delivered`, not a bare `success: true`. Off a deployed platform a
      // failed send does not throw — the link is in the log — and the client
      // must not announce an invite that is sitting in a terminal.
      return { success: true, delivered };
    }),
  invites: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Invite addresses are personal detail; watchers never see them.
      await requireTripRole(input.tripId, ctx.user.id, "tripmate");
      return db.getTripInvites(input.tripId);
    }),
  revokeInvite: protectedProcedure
    .input(z.object({ tripId: z.number(), inviteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      const invites = await db.getTripInvites(input.tripId);
      const invite = invites.find(i => i.id === input.inviteId);
      if (!invite)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found.",
        });
      await db.setInviteStatus(invite.id, "revoked");
      return { success: true };
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        description: z.string().optional(),
        currency: z.string().default("USD"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripAllowance(ctx.user.id);
      const inviteCode = nanoid(12);
      const tripId = await db.createTrip({
        ...input,
        organizerId: ctx.user.id,
        inviteCode,
      });
      await db.addTripMember({
        tripId,
        userId: ctx.user.id,
        role: "admin",
        status: "accepted",
        joinedVia: "creator",
        respondedAt: new Date(),
      });
      // A member is an attendee too, so headcount is one number rather than
      // "members plus attendees, mind the overlap".
      await db.upsertMemberAttendee(
        tripId,
        ctx.user.id,
        ctx.user.name || "Member",
        null
      );
      await db.recordProductEvent({
        event: "trip.created",
        tripId,
        actorUserId: ctx.user.id,
        metadata: { cloned: false },
      });
      return { id: tripId, inviteCode };
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        phase: z
          .enum([
            "setup",
            "dates",
            "destination",
            "accommodation",
            "activities",
            "finalized",
          ])
          .optional(),
        status: z
          .enum(["planning", "active", "completed", "cancelled"])
          .optional(),
        currency: z.string().optional(),
        totalBudget: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Until this check existed any signed-in user could rename any trip, and
      // change its phase, status, currency and budget.
      await requireTripRole(input.id, ctx.user.id, "admin");
      // Read before the write so a status that was already `completed` is not
      // counted again every time an admin saves the dialog.
      const before = await db.getTrip(input.id);
      const { id, ...data } = input;
      await db.updateTrip(id, data);
      await db.recordActivity({
        tripId: id,
        actorUserId: ctx.user.id,
        action: "trip.edited",
        entityType: "trip",
        entityId: id,
        metadata: { fields: Object.keys(data) },
      });
      // The app has no "archived": `cancelled` is the nearest state it has, and
      // it is recorded as itself rather than folded into completion, which
      // would make the decision-completion figure flattering and wrong.
      if (input.status && input.status !== before?.status) {
        if (input.status === "completed")
          await db.recordProductEvent({
            event: "trip.completed",
            tripId: id,
            actorUserId: ctx.user.id,
          });
        else if (input.status === "cancelled")
          await db.recordProductEvent({
            event: "trip.cancelled",
            tripId: id,
            actorUserId: ctx.user.id,
          });
      }
      return { success: true };
    }),
  /**
   * Switches sections off for the whole trip.
   *
   * Admin-only, and the whole set is sent every time: one key at a time would
   * let two admins with the settings screen open interleave into a state
   * neither of them chose.
   *
   * **This hides, it does not forbid.** Every proposal and vote in a hidden
   * section stays exactly where it was and comes back untouched when the
   * section is switched on again, and the section's own procedures keep
   * working — deliberately. Gating them would put a check in every procedure of
   * four routers, and would refuse the admin re-enabling the thing they just
   * turned off. Nothing here is an authorisation boundary; do not treat it as
   * one.
   */
  setHiddenSections: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        hidden: z.array(z.enum(HIDEABLE_SECTION_KEYS)),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      // Deduplicated, because the array arrives from a client and a repeated
      // key would be stored and read back forever.
      const hidden = [...new Set(input.hidden)];
      await db.setTripHiddenSections(input.tripId, hidden);
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "trip.edited",
        entityType: "trip",
        entityId: input.tripId,
        metadata: { fields: ["hiddenSections"] },
      });
      return { success: true };
    }),
  /**
   * Deletes the trip and everything in it, for everyone.
   *
   * Admin-only and irreversible, so the name has to be typed back: this is the
   * one action in the app that destroys other people's work, and an admin who
   * meant to leave a trip must not be one tap away from ending it for the
   * whole group. `db.deleteTripCascade` does the removal in a transaction.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number(), confirmName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.id, ctx.user.id, "admin");
      const trip = await db.getTrip(input.id);
      if (!trip)
        throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });
      if (input.confirmName.trim() !== trip.name.trim())
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That name doesn't match the trip's name.",
        });

      // Told before it happens: afterwards there is no trip to hang a
      // notification off, and `deleteTripCascade` removes these rows anyway.
      const members = await db.getTripMembers(input.id);
      for (const m of members) {
        if (m.userId === ctx.user.id) continue;
        await db.createNotification({
          userId: m.userId,
          type: "general",
          title: "A trip was deleted",
          message: `${ctx.user.name || "An admin"} deleted the trip "${trip.name}".`,
        });
      }

      await db.deleteTripCascade(input.id);
      return { success: true };
    }),
  /**
   * A fresh trip carrying this one's proposals.
   *
   * Admin-only for the same reason `invites` is: cloning copies the whole plan,
   * and a watcher is on a trip to follow it rather than to take a copy of it.
   * What does and does not come across is decided in `db.cloneTripContents`.
   */
  clone: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.id, ctx.user.id, "admin");
      // Cloning makes a trip like any other, so it costs the same allowance.
      // Checked after the role, so somebody who cannot clone this trip is told
      // that rather than being shown a paywall for something they could not do
      // anyway.
      await requireTripAllowance(ctx.user.id);
      const source = await db.getTrip(input.id);
      if (!source)
        throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });

      const name = input.name?.trim() || `${source.name} (copy)`;
      const tripId = await db.createTrip({
        name: name.slice(0, 255),
        description: source.description,
        currency: source.currency,
        totalBudget: source.totalBudget,
        // The same trip run again wants the same sections. A copy of a one-day
        // trip should not arrive with accommodation voting switched back on.
        hiddenSections: source.hiddenSections,
        organizerId: ctx.user.id,
        // A new code: sharing the original's would put anyone following an old
        // link into whichever of the two trips resolved first.
        inviteCode: nanoid(12),
      });
      await db.addTripMember({
        tripId,
        userId: ctx.user.id,
        role: "admin",
        status: "accepted",
        joinedVia: "creator",
        respondedAt: new Date(),
      });
      await db.upsertMemberAttendee(
        tripId,
        ctx.user.id,
        ctx.user.name || "Member",
        null
      );

      await db.cloneTripContents(input.id, tripId, ctx.user.id);
      await db.recordActivity({
        tripId,
        actorUserId: ctx.user.id,
        action: "trip.cloned",
        entityType: "trip",
        entityId: tripId,
        metadata: { from: input.id },
      });
      // A clone is a trip created, flagged so the two can be told apart.
      await db.recordProductEvent({
        event: "trip.created",
        tripId,
        actorUserId: ctx.user.id,
        metadata: { cloned: true },
      });
      return { id: tripId };
    }),
  /**
   * Joining a trip from an invite link.
   *
   * **The shared link admits people, but only as many as an admin said, and
   * only while they said.** It used to admit anybody who held it, for ever:
   * forwarded in a group chat, pasted into a message thread, left in a browser
   * history on a shared laptop — the trip had no say, and the URL was the
   * membership. It is now off until an admin turns it on with a number beside
   * it, each join spends one of those, and an expiry date stops it regardless.
   * `spendInviteLinkUse` is the gate; `shared/inviteLink.ts` is what everybody
   * is told. [ADR-0028](../../docs/adr/0028-the-shared-link-is-off-by-default.md).
   *
   * An **emailed** invite is a different door and is not affected by that
   * switch: the trip addressed a specific person and named the role they get.
   * That only holds while the invite is still what it was, so two things are
   * checked here — the invite must still be open (see `declineInvite` for the
   * other half), and the account accepting it must be the address it was sent
   * to. A forwarded invitation is somebody else's post: it is not honoured,
   * it does not spend one of the link's uses, and that person becomes a
   * `pending` request an admin answers on the members screen. Pending is the
   * one state where somebody is on a trip's books and has nothing: nothing is
   * shown to them, nothing is counted for them, and `requireTripRole` refuses
   * every trip procedure.
   *
   * Demo trips are exempt from all of it — see `isDemoTrip`.
   */
  join: protectedProcedure
    .input(
      z.object({
        inviteCode: z.string(),
        /** Present when they followed an emailed invite rather than a shared link. */
        inviteToken: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trip = await db.getTripByInviteCode(input.inviteCode);
      if (!trip)
        throw new TRPCError({ code: "NOT_FOUND", message: "Trip not found." });

      // The marketing tour: a prospect follows a link and is in the trip, with
      // nobody on the other side to approve them.
      const openToAnyone = isDemoTrip(trip.inviteCode);

      const existing = await db.getTripMember(trip.id, ctx.user.id);
      // Already in. Answering "you are in" rather than throwing keeps the join
      // screen idempotent — a link opened twice, or a stale tab.
      if (existing?.status === "accepted")
        return { tripId: trip.id, status: "accepted" as const, reason: null };

      // An emailed invite decides the role and records how they arrived; a bare
      // link makes a request for a tripmate seat that somebody has to grant.
      let role: "watcher" | "tripmate" | "admin" = "tripmate";
      let joinedVia: "link" | "email" = "link";
      let invitedBy: number | null = null;
      // Set when the invite came from importing a family, so somebody added as
      // one of the Patels arrives as one rather than ungrouped.
      let groupId: number | null = null;
      /** Why they are in the queue rather than in the trip, when they are. */
      let reason: "link" | "wrong-address" | null = "link";

      if (input.inviteToken) {
        const invite = await db.getTripInviteByToken(input.inviteToken);
        if (!invite || invite.tripId !== trip.id)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That invitation isn't valid for this trip.",
          });
        // Spent or withdrawn. Refused outright rather than quietly downgraded
        // to a request: the person holding it thinks they have an invitation,
        // and the honest answer is that they no longer do.
        if (invite.status !== "pending" && !openToAnyone)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              invite.status === "revoked"
                ? "That invitation was withdrawn. Ask an admin for a new one."
                : "That invitation has already been used.",
          });

        if (openToAnyone || sameEmail(invite.email, ctx.user.email)) {
          role = invite.role;
          joinedVia = "email";
          invitedBy = invite.invitedBy;
          groupId = invite.groupId ?? null;
          reason = null;
          await db.setInviteStatus(invite.id, "accepted");
        } else {
          // Not the addressee. The invite stays open for whoever it was sent
          // to, and this becomes an ordinary request — told apart from a link
          // join so the screen can explain why it did not just work.
          reason = "wrong-address";
        }
      }

      // The link itself decides, and it decides by being spent: a conditional
      // UPDATE that checks the switch, the expiry and the count in one place,
      // so two people tapping at the same moment cannot both take the last
      // use. A refusal here is the link being closed, not this person being
      // unwelcome, which is why the message says to ask an admin.
      //
      // Not spent for a forwarded invitation (`wrong-address`): that person
      // waits for an admin instead, and burning one of the trip's link uses on
      // somebody who is not using the link would be wrong twice over.
      if (reason === "link" && !openToAnyone) {
        const left = await db.spendInviteLinkUse(trip.id);
        // `null` is "no row updated" — no use was available, whichever of the
        // three conditions failed. A number is what is left after this join.
        if (typeof left !== "number")
          throw new TRPCError({
            code: "FORBIDDEN",
            message: INVITE_LINK_CLOSED_MESSAGE,
          });
        reason = null;
      }

      const accepted = reason === null || openToAnyone;
      const status = accepted ? "accepted" : "pending";

      if (existing) {
        // A row already here means they asked before, or answered before.
        // Re-open it rather than leaving somebody stuck behind an old answer.
        await db.setMemberStatus(trip.id, ctx.user.id, status, {
          ...(accepted ? { role } : {}),
          joinedVia,
        });
      } else {
        await db.addTripMember({
          tripId: trip.id,
          userId: ctx.user.id,
          role,
          status,
          joinedVia,
          invitedBy,
          groupId,
          respondedAt: accepted ? new Date() : null,
        });
      }

      if (!accepted) {
        await db.recordActivity({
          tripId: trip.id,
          actorUserId: ctx.user.id,
          action: "member.requested",
          entityType: "member",
          entityId: ctx.user.id,
        });
        await notifyAdmins(
          trip.id,
          ctx.user.id,
          "Someone asked to join",
          `${ctx.user.name || "Someone"} asked to join "${trip.name}". Approve or decline them on the members screen.`
        );
        // Deliberately no `invite.accepted` event: nobody has accepted
        // anything yet. `respondToJoinRequest` records it if an admin agrees,
        // which is what keeps the acceptance rate a measure of people who
        // actually got in.
        return { tripId: trip.id, status: "pending" as const, reason };
      }

      // A member is an attendee too, and only once they are really a member: a
      // pending request must not appear in the headcount the budget divides by.
      //
      // Idempotent: a re-accepted invite must not count somebody twice, which
      // a partial unique index on (tripId, memberUserId) also enforces.
      await db.upsertMemberAttendee(
        trip.id,
        ctx.user.id,
        ctx.user.name || "Member",
        groupId
      );

      await db.recordActivity({
        tripId: trip.id,
        actorUserId: ctx.user.id,
        action: "member.joined",
        entityType: "member",
        entityId: ctx.user.id,
        metadata: { role, joinedVia },
      });
      // `via` is what keeps the acceptance rate honest: only the `email` half
      // has a matching `invite.sent` to divide by. See the metrics runbook.
      await db.recordProductEvent({
        event: "invite.accepted",
        tripId: trip.id,
        actorUserId: ctx.user.id,
        metadata: { role, via: joinedVia },
      });

      // Tell the admins, not the whole trip — and never a watcher.
      await notifyAdmins(
        trip.id,
        ctx.user.id,
        "New member joined!",
        `${ctx.user.name || "Someone"} joined your trip "${trip.name}"`
      );
      return { tripId: trip.id, status: "accepted" as const, reason: null };
    }),
  /**
   * The shared link's three settings, written together.
   *
   * Together because they are one decision — "yes, up to five people, until
   * Friday" — and because a switch that could be turned on without a number
   * would be the open door this replaced. Enabling therefore *requires* a
   * count; there is no unlimited.
   *
   * The count is what is **left**, not a total: an admin who wants three more
   * people types three, whatever the link has already admitted. That also
   * makes reopening a used-up link the same action as setting it up, rather
   * than arithmetic against a number nobody remembers.
   */
  setInviteLink: protectedProcedure
    .input(
      z
        .object({
          tripId: z.number(),
          enabled: z.boolean(),
          /** How many more people may join. Required while `enabled`. */
          usesLeft: z.number().int().min(1).max(100).nullable().optional(),
          /** When it stops regardless. Null means no expiry. */
          expiresAt: z.date().nullable().optional(),
        })
        .refine(v => !v.enabled || typeof v.usesLeft === "number", {
          message: "Say how many people the link may admit.",
          path: ["usesLeft"],
        })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      const expiresAt = input.expiresAt ?? null;
      if (input.enabled && expiresAt && expiresAt.getTime() <= Date.now())
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That date has already passed.",
        });

      await db.setInviteLink(input.tripId, {
        enabled: input.enabled,
        // Turning the link off keeps the number, so switching it back on does
        // not silently hand out a fresh allowance nobody asked for.
        usesLeft: input.usesLeft ?? null,
        expiresAt,
      });
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "trip.edited",
        entityType: "trip",
        entityId: input.tripId,
        // The settings, never the code itself: the activity trail is shown to
        // the trip, and the link is the one thing on this screen that is a
        // credential.
        metadata: {
          fields: ["inviteLink"],
          enabled: input.enabled,
          usesLeft: input.usesLeft ?? null,
          expires: Boolean(expiresAt),
        },
      });
      return { success: true };
    }),
  /**
   * Leaving a trip you are on.
   *
   * The same removal an admin can perform, asked for by the person themselves
   * — so it takes their member row and their attendee row, and leaves their
   * proposals, votes and comments where they are. The group decided things
   * with those in the room; deleting them would silently re-open settled
   * questions, and `removeMember` has always worked this way.
   *
   * The last admin cannot leave, for the same reason they cannot be removed: a
   * trip nobody can administer cannot invite, finalise or even be deleted.
   *
   * It does **not** give a link use back. The number is uses of the link, not
   * seats at the table — somebody who joins and leaves has used the link, and
   * an admin who wants to replace them says so.
   */
  leave: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const member = await requireTripRole(
        input.tripId,
        ctx.user.id,
        "watcher"
      );
      if (member.role === "admin") {
        const admins = await db.countTripAdmins(input.tripId);
        if (admins <= 1)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "You are this trip's only admin. Make someone else an admin first.",
          });
      }
      const trip = await db.getTrip(input.tripId);
      await db.removeTripMember(input.tripId, ctx.user.id);
      await db.deleteMemberAttendee(input.tripId, ctx.user.id);
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "member.left",
        entityType: "member",
        entityId: ctx.user.id,
      });
      // Told to the admins, who are the ones who have to decide whether to
      // replace them — and who would otherwise find out from a headcount that
      // changed on its own.
      await notifyAdmins(
        input.tripId,
        ctx.user.id,
        "Someone left the trip",
        `${ctx.user.name || "Someone"} left "${trip?.name ?? "your trip"}".`
      );
      return { success: true };
    }),
  /**
   * An admin's answer to a request to join.
   *
   * The other end of the link rule above: until this runs, somebody who
   * followed the shared link is a row and nothing more. Approving is what
   * makes them a member, puts them in the headcount, and — because this is the
   * moment somebody actually got in — records the acceptance.
   */
  respondToJoinRequest: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        userId: z.number(),
        decision: z.enum(["approve", "decline"]),
        /** The seat they get. Defaults to the one they asked for. */
        role: roleInput.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      const trip = await db.getTrip(input.tripId);
      const member = await db.getTripMember(input.tripId, input.userId);
      if (!trip || !member)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Nobody by that name has asked to join.",
        });
      // Two admins with the screen open must not both answer, and an answer
      // must not be reversible through this door — removing a member is
      // `removeMember`, which says so to everybody.
      if (member.status !== "pending")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That request has already been answered.",
        });

      if (input.decision === "decline") {
        await db.setMemberStatus(input.tripId, input.userId, "declined");
        await db.recordActivity({
          tripId: input.tripId,
          actorUserId: ctx.user.id,
          action: "member.rejected",
          entityType: "member",
          entityId: input.userId,
        });
        await db.createNotification({
          userId: input.userId,
          type: "general",
          title: "Your request wasn't accepted",
          message: `You weren't added to "${trip.name}".`,
        });
        return { success: true, status: "declined" as const };
      }

      const role = input.role ?? member.role;
      const joiner = await db.getUserById(input.userId);
      await db.setMemberStatus(input.tripId, input.userId, "accepted", {
        role,
      });
      await db.upsertMemberAttendee(
        input.tripId,
        input.userId,
        joiner?.name || "Member",
        member.groupId ?? null
      );
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: input.userId,
        action: "member.joined",
        entityType: "member",
        entityId: input.userId,
        metadata: { role, joinedVia: member.joinedVia ?? "link" },
      });
      await db.recordProductEvent({
        event: "invite.accepted",
        tripId: input.tripId,
        // The person who joined, not the admin who let them: the event is
        // about the invitation being taken up.
        actorUserId: input.userId,
        metadata: { role, via: "link" },
      });
      await db.createNotification({
        userId: input.userId,
        tripId: input.tripId,
        type: "general",
        title: "You're in",
        message: `${ctx.user.name || "An admin"} added you to "${trip.name}".`,
      });
      return { success: true, status: "accepted" as const };
    }),
  /**
   * Turning down an emailed invite, without joining.
   *
   * Bound to the address it was sent to, like accepting one: a forwarded link
   * must not let a stranger answer on the invitee's behalf — that is a way to
   * quietly keep somebody off a trip. Pending only, so an answer already given
   * cannot be overwritten by an old link.
   */
  declineInvite: protectedProcedure
    .input(z.object({ inviteToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invite = await db.getTripInviteByToken(input.inviteToken);
      if (!invite)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invite not found.",
        });
      if (invite.status !== "pending")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That invitation has already been answered.",
        });
      if (!sameEmail(invite.email, ctx.user.email))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "That invitation was sent to a different email address.",
        });
      await db.setInviteStatus(invite.id, "declined");
      await db.recordActivity({
        tripId: invite.tripId,
        actorUserId: ctx.user.id,
        action: "member.declined",
        entityType: "invite",
        entityId: invite.id,
      });
      return { success: true };
    }),
  members: protectedProcedure
    .input(z.object({ tripId: z.number() }))
    .query(async ({ ctx, input }) => {
      const role = await tripRoleOf(input.tripId, ctx.user.id);
      const members = await db.getTripMembers(input.tripId);
      return projectMembersForRole(members, role);
    }),
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        userId: z.number(),
        role: roleInput,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      if (input.userId === ctx.user.id)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "You can't change your own role. Ask another admin to do it.",
        });
      const target = await db.getTripMember(input.tripId, input.userId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found.",
        });
      // Demoting the last admin would leave a trip nobody can administer.
      if (target.role === "admin" && input.role !== "admin") {
        const admins = await db.countTripAdmins(input.tripId);
        if (admins <= 1)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This is the trip's only admin. Make someone else an admin first.",
          });
      }
      await db.updateMemberRole(input.tripId, input.userId, input.role);
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "member.role_changed",
        entityType: "member",
        entityId: input.userId,
        metadata: { from: target.role, to: input.role },
      });
      return { success: true };
    }),
  removeMember: protectedProcedure
    .input(z.object({ tripId: z.number(), userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireTripRole(input.tripId, ctx.user.id, "admin");
      const target = await db.getTripMember(input.tripId, input.userId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Member not found.",
        });
      if (target.role === "admin") {
        const admins = await db.countTripAdmins(input.tripId);
        if (admins <= 1)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This is the trip's only admin. Make someone else an admin first.",
          });
      }
      await db.removeTripMember(input.tripId, input.userId);
      // Their attendee row goes with them: leaving it behind would keep them in
      // the headcount and in every per-person figure derived from it.
      await db.deleteMemberAttendee(input.tripId, input.userId);
      await db.recordActivity({
        tripId: input.tripId,
        actorUserId: ctx.user.id,
        action: "member.removed",
        entityType: "member",
        entityId: input.userId,
      });
      return { success: true };
    }),
  updateMemberBudget: protectedProcedure
    .input(
      z.object({
        tripId: z.number(),
        budgetMax: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const member = await requireTripRole(
        input.tripId,
        ctx.user.id,
        "tripmate"
      );
      // A cap belongs to whatever is being charged. In a group that is the
      // group — one household, one wallet — and setting a personal one there
      // would be a number nothing reads.
      if (member.groupId != null) {
        await db.updateTripGroup(member.groupId, {
          budgetMax: input.budgetMax,
        });
        return { success: true, appliedTo: "group" as const };
      }
      await db.updateMemberBudget(input.tripId, ctx.user.id, input.budgetMax);
      return { success: true, appliedTo: "member" as const };
    }),
});
