import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context.js";
import { logger } from "./logger.js";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

/**
 * Logs every procedure call with its duration, and every failure with the cause.
 * Applied to all procedures below so no route can silently swallow an error.
 */
const withLogging = t.middleware(async ({ ctx, path, type, next }) => {
  const startedAt = process.hrtime.bigint();
  const result = await next();
  const durationMs =
    Math.round((Number(process.hrtime.bigint() - startedAt) / 1e6) * 100) / 100;

  const log = ctx.log ?? logger;
  const fields = { procedure: path, type, durationMs, userId: ctx.user?.id };

  if (result.ok) {
    log.debug("trpc ok", fields);
  } else {
    // Client mistakes (auth, validation, not found) are expected; only real
    // server faults deserve error level and a stack trace.
    const code = result.error.code;
    const isServerFault = code === "INTERNAL_SERVER_ERROR";
    if (isServerFault)
      log.error("trpc failed", { ...fields, code, err: result.error });
    else
      log.warn("trpc rejected", {
        ...fields,
        code,
        reason: result.error.message,
      });
  }

  return result;
});

/** All procedures derive from this, so logging is never opt-in. */
const base = t.procedure.use(withLogging);

export const publicProcedure = base;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  // Not "signed out" — "we could not tell". Saying `UNAUTHED_ERR_MSG` here
  // would send the client to the landing page over a database blip, so this
  // fails as the server fault it is. See `createContext`.
  if (ctx.authFailed) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not verify your session. Please try again.",
    });
  }

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = base.use(requireUser);

export const adminProcedure = base.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  })
);
