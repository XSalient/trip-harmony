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

export const authRouter = router({
  /** Current session user. Never returns credential columns — see `toPublicUser`. */
  me: publicProcedure.query(({ ctx }) => toPublicUser(ctx.user)),
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
   * this exists to remove the form — not to weaken sign-in. Three things keep
   * it from being a way into a real account:
   *
   * 1. The `openId` it looks up is **built** from `DEMO_OPEN_ID_PREFIX` and a
   *    key matching `DEMO_PERSONA_KEY_PATTERN`. There is no input path that
   *    reaches an account without that prefix, so the blast radius is exactly
   *    the set of rows `pnpm seed:demo` created.
   * 2. It only answers when the demo has been seeded. On a deployment with no
   *    demo in it, every persona is NOT_FOUND and the landing page hides the
   *    button that calls this.
   * 3. It grants nothing the published credentials didn't already — the demo
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
  capabilities: publicProcedure.query(() => ({
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
