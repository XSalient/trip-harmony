/**
 * Registration, password + magic-link sign-in, session cookie lifecycle.
 */
import { publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import crypto from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import * as db from "../db";
import { sendMagicLinkEmail } from "../utils/mailer";
import { hashPassword, toPublicUser, verifyPassword } from "./_shared";

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
      await sendMagicLinkEmail(input.email, magicUrl);
      const isDev = process.env.NODE_ENV === "development";
      return { success: true, ...(isDev ? { debugUrl: magicUrl } : {}) };
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
