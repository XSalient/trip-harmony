/**
 * Registration, password + magic-link sign-in, session cookie lifecycle.
 */
import { protectedProcedure, publicProcedure, router } from "../_core/trpc.js";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import {
  DEMO_OPEN_ID_PREFIX,
  DEMO_PERSONA_KEY_PATTERN,
  DEMO_TOUR_ENV_VAR,
  isDemoTourHost,
} from "../../shared/demo.js";
import { getSessionCookieOptions } from "../_core/cookies.js";
import { sdk } from "../_core/sdk.js";
import * as db from "../db.js";
import { config } from "../_core/env.js";
import {
  canEmailAnyRecipient,
  isEmailConfigured,
  sendMagicLinkEmail,
} from "../utils/mailer.js";
import { hashPassword, toPublicUser, verifyPassword } from "./_shared.js";

/**
 * Whether this request should be offered the demo.
 *
 * The host decides — see `isDemoTourHost` for why it cannot be configuration.
 * `DEMO_TOUR_ENABLED` forces it on for hosts the check would refuse, which is
 * what makes the demo testable on a preview deployment, where the URL is
 * generated per build and cannot be known in advance.
 *
 * The override is opt-in rather than a kill switch, the opposite polarity to
 * `AI_ENABLED`. Getting it wrong in the safe direction hides a demo; getting it
 * wrong in the other puts one on the marketing site.
 */
function showsDemoTour(req: {
  get(name: string): string | undefined;
}): boolean {
  const override = process.env[DEMO_TOUR_ENV_VAR]?.trim().toLowerCase();
  if (override && /^(1|true|yes|on|enabled?)$/.test(override)) return true;
  return isDemoTourHost(req.get("host"));
}

export const authRouter = router({
  /**
   * Current session user. Never returns credential columns — see `toPublicUser`.
   *
   * Public, so `requireUser` never runs and the `authFailed` check has to be
   * repeated here. It matters most on this procedure: the whole client treats a
   * null `me` as signed out, so reporting one when the session merely could not
   * be looked up is what bounced people to the landing page on its own.
   */
  me: publicProcedure.query(({ ctx }) => {
    if (ctx.authFailed) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not verify your session. Please try again.",
      });
    }
    return toPublicUser(ctx.user);
  }),
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        email: z.string().email(),
        password: z.string().min(8),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getUserByEmail(input.email);
      if (existing)
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists.",
        });
      const passwordHash = await hashPassword(input.password);
      const openId = `email:${nanoid(32)}`;
      const user = await db.createUserWithPassword({
        openId,
        name: input.name,
        email: input.email,
        passwordHash,
      });
      if (!user)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create account.",
        });
      const token = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      return { success: true };
    }),
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.getUserByEmail(input.email);
      if (!user || !user.passwordHash)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password.",
        });
      const valid = await verifyPassword(input.password, user.passwordHash);
      if (!valid)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password.",
        });
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      const token = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      return { success: true };
    }),
  /**
   * Signs a visitor into a seeded demo account, with nothing to type.
   *
   * A demo whose front door is a login form is a demo most people close, so
   * this exists to remove the form — not to weaken sign-in. Four things keep
   * it from being a way into a real account:
   *
   * 1. The `openId` it looks up is **built** from `DEMO_OPEN_ID_PREFIX` and a
   *    key matching `DEMO_PERSONA_KEY_PATTERN`. There is no input path that
   *    reaches an account without that prefix, so the blast radius is exactly
   *    the set of rows `pnpm seed:demo` created.
   * 2. It only answers on a demo host. The product site and the sales demo are
   *    one deployment behind two domains, and this is what keeps the demo on
   *    its own — the hidden button is presentation, this is the rule.
   * 3. It only answers when the demo has been seeded. On a deployment with no
   *    demo in it, every persona is NOT_FOUND and the landing page hides the
   *    button that calls this.
   * 4. It grants nothing the published credentials didn't already — the demo
   *    password is in the runbook and in `scripts/demo/options.ts` on purpose.
   *
   * The seeded accounts hold no real personal data: invented names at a
   * reserved `.example` domain, in trips nobody real is a member of.
   */
  demoSignIn: publicProcedure
    .input(
      z.object({
        persona: z.string().regex(DEMO_PERSONA_KEY_PATTERN),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // The same answer as an unseeded deployment, deliberately: a caller
      // probing the production host learns that there is no demo here, not that
      // there is one somewhere else. Hiding the button alone would be
      // decoration — this is the part that makes the demo host-bound.
      if (!showsDemoTour(ctx.req)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This deployment has no demo in it.",
        });
      }

      const user = await db.getUserByOpenId(
        `${DEMO_OPEN_ID_PREFIX}${input.persona}`
      );
      if (!user)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This deployment has no demo in it.",
        });

      const token = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      return { success: true, name: user.name };
    }),
  requestMagicLink: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const token = crypto.randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await db.createMagicLinkToken(input.email, token, expiresAt);
      const proto = ctx.req.get("x-forwarded-proto") || ctx.req.protocol;
      const origin = `${proto}://${ctx.req.get("host")}`;
      const magicUrl = `${origin}/auth/magic/${token}`;
      const delivery = await sendMagicLinkEmail(input.email, magicUrl);
      // Outside production the link is recoverable from the log, so a failed
      // send is not a dead end and the URL is handed back for convenience.
      const isDev = !config.isProduction;
      // Never report success when the email did not go out — otherwise the UI
      // tells people to check an inbox that will stay empty.
      if (!delivery.delivered && !isDev) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            delivery.reason === "not_configured"
              ? "We couldn't send the sign-in email. Email delivery isn't configured for this deployment yet — set RESEND_API_KEY (or the SMTP_* variables) and try again."
              : "We couldn't send the sign-in email to that address just now. Please try again in a moment, or sign in with your password instead.",
        });
      }
      return { success: true, ...(isDev ? { debugUrl: magicUrl } : {}) };
    }),

  // Lets the sign-in UI hide email-based options this deployment cannot
  // actually serve, instead of offering a link that will never arrive.
  capabilities: publicProcedure.query(({ ctx }) => ({
    // Whether to offer the demo at all. The landing page pairs this with "has a
    // demo actually been seeded", and needs both.
    demoTour: showsDemoTour(ctx.req),
    // Offer passwordless whenever a provider exists — the UI keeps a password
    // route one click away, so a link that fails to arrive is a detour rather
    // than a dead end.
    magicLink: isEmailConfigured() || !config.isProduction,
    // False when mail can only reach the operator (Resend's sandbox sender).
    // The UI then shows the password field up front instead of after a link
    // that will never land.
    magicLinkReliable: canEmailAnyRecipient() || !config.isProduction,
  })),

  // Whether the signed-in account can sign in with a password. Accounts created
  // by magic link have no password hash, so without one they would have no way
  // back in if magic link is unavailable.
  hasPassword: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.getUserById(ctx.user.id);
    return { hasPassword: Boolean(user?.passwordHash) };
  }),

  setPassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().optional(),
        newPassword: z
          .string()
          .min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found.",
        });
      // Only accounts that already have a password must prove the old one;
      // magic-link accounts have none to prove, and the session cookie is the
      // authorisation there.
      if (user.passwordHash) {
        if (!input.currentPassword) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Enter your current password.",
          });
        }
        const valid = await verifyPassword(
          input.currentPassword,
          user.passwordHash
        );
        if (!valid)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Current password is incorrect.",
          });
      }
      await db.setUserPassword(user.id, await hashPassword(input.newPassword));
      return { success: true };
    }),
  /**
   * What deleting this account would do, without doing it.
   *
   * The dialog needs to say "2 trips will be deleted" before the button is
   * live, not after. Shares `planAccountDeletion` with the mutation, so the
   * warning and the work cannot drift apart.
   */
  deletionImpact: protectedProcedure.query(async ({ ctx }) => {
    const { handovers, abandoned } = await db.planAccountDeletion(ctx.user.id);
    return {
      tripsHandedOver: handovers.length,
      tripsDeleted: abandoned.length,
    };
  }),

  /**
   * Delete the signed-in account, for good.
   *
   * Apple has required this to be reachable from inside the app since 2022, and
   * it is checked in review — a link to a support form does not pass. The
   * cascade, and why a deleted account keeps an anonymised row, is documented
   * on `db.deleteUserCascade`.
   *
   * An account with a password must re-enter it. That is not friction for its
   * own sake: a session cookie is a long-lived bearer token on a device that
   * may be borrowed or stolen, and this is the one action nothing can undo.
   * Magic-link accounts have no password to prove, so for them the session is
   * the authorisation — the same rule `setPassword` already applies.
   */
  deleteAccount: protectedProcedure
    .input(
      z.object({
        /** Typed by hand in the dialog, so the button alone cannot do this. */
        confirm: z.literal("DELETE"),
        password: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found.",
        });

      if (user.passwordHash) {
        if (!input.password)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Enter your password to confirm.",
          });
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "That password is incorrect.",
          });
      }

      const outcome = await db.deleteUserCascade(user.id);

      // The only record that will exist afterwards. Deliberately no email and
      // no name — the point of the operation is that those are gone.
      ctx.log.info("account deleted", {
        userId: user.id,
        tripsHandedOver: outcome.tripsHandedOver,
        tripsDeleted: outcome.tripsDeleted,
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true, ...outcome };
    }),

  verifyMagicLink: publicProcedure
    .input(
      z.object({
        token: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const row = await db.consumeMagicLinkToken(input.token);
      if (!row)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "This magic link is invalid or has expired.",
        });
      let user = await db.getUserByEmail(row.email);
      if (!user) {
        const openId = `magic:${nanoid(32)}`;
        const name = row.email.split("@")[0];
        user = await db.createUserWithPassword({
          openId,
          name,
          email: row.email,
          passwordHash: "",
        });
      }
      if (!user)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to authenticate.",
        });
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      const name = user.name || row.email.split("@")[0] || "User";
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name,
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      return { success: true };
    }),
});
