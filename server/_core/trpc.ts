import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "../../shared/const.js";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context.js";
import { logger } from "./logger.js";
import { clientSafeMessage, readableValidationMessage } from "./trpcErrors.js";
import {
  blockedTermMessage,
  findBlockedTerm,
} from "../../shared/moderation.js";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  /**
   * Keeps a server fault from telling the client more than it should.
   *
   * tRPC puts a thrown error's message into the response, and drizzle's message
   * for a failed query is the entire column list plus the parameters — which is
   * how a user once saw `passwordHash` and their own email address in a toast.
   * `clientSafeMessage` decides what may be said; the detail still reaches the
   * logs through `logTrpcError`, keyed by the same request id this quotes.
   */
  errorFormatter({ shape, error, ctx }) {
    // Input that failed validation: a sentence rather than a schema dump.
    const readable = readableValidationMessage(error);
    if (readable) return { ...shape, message: readable };

    const safe = clientSafeMessage(error, ctx?.requestId);
    if (!safe) return shape;
    return {
      ...shape,
      message: safe,
      data: { ...shape.data, stack: undefined },
    };
  },
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

/**
 * The input fields that carry prose somebody typed, and the noun to call each
 * one when refusing it.
 *
 * An allow-list, not a deny-list, and that direction is the point. The filter
 * must never see `pageText` — 400kB of scraped listing HTML in
 * `accommodations.importFromUrl`, whose contents are some hotel's problem and
 * not this app's — nor a URL, an email, a password or a fingerprint. Naming the
 * fields that *are* prose keeps every one of those out by construction, where a
 * deny-list would let the next one in by default.
 */
const USER_TEXT_FIELDS: Record<string, string> = {
  name: "name",
  description: "description",
  title: "title",
  covers: "note",
  notes: "note",
  note: "note",
  label: "label",
  content: "comment",
  mustHaves: "must-haves",
  strongPreferences: "preferences",
  avoids: "avoids",
  openComments: "comments",
};

/**
 * Apply the content filter to every mutation, in one place.
 *
 * Apple's guideline 1.2 wants objectionable material filtered. Doing it here
 * rather than at each call site is what makes that claim true of the whole API:
 * there are twenty-odd free-text fields across eight routers, and a check
 * copy-pasted into each is a check that the twenty-first will not have. A new
 * router gets this for free; a new prose field costs one line above.
 *
 * Queries are skipped — nothing is being stored — and so is any input that is
 * not a plain object, which is every procedure taking a bare id.
 */
const withContentFilter = t.middleware(async opts => {
  if (opts.type !== "mutation") return opts.next();
  const input = opts.getRawInput ? await opts.getRawInput() : undefined;
  if (!input || typeof input !== "object" || Array.isArray(input))
    return opts.next();

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const field = USER_TEXT_FIELDS[key];
    if (!field || typeof value !== "string") continue;
    const term = findBlockedTerm(value);
    if (term)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: blockedTermMessage(field, term),
      });
  }

  return opts.next();
});

/**
 * All procedures derive from this, so logging and the content filter are never
 * opt-in.
 */
const base = t.procedure.use(withLogging).use(withContentFilter);

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
