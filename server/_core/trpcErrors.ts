/**
 * Database and network failures surface as a generic "Failed query" from
 * drizzle, with the useful part (pg error code, host, port) buried in the
 * cause chain. Flatten the whole chain onto the log entry so a production
 * failure is diagnosable from the platform logs without a reproduction.
 */
import { fromError, isZodErrorLike } from "zod-validation-error/v4";

import { config } from "./env.js";
import { logger } from "./logger.js";

const MAX_CAUSE_DEPTH = 5;

type CauseLike = {
  message?: string;
  code?: string;
  address?: string;
  port?: number;
  cause?: unknown;
};

/** Walks `error.cause` into a flat, loggable array. */
export function flattenCauses(error: unknown): Array<Record<string, unknown>> {
  const chain: Array<Record<string, unknown>> = [];
  let cause: unknown = (error as { cause?: unknown })?.cause;

  for (let depth = 0; cause && depth < MAX_CAUSE_DEPTH; depth++) {
    const c = cause as CauseLike;
    chain.push({
      message: c.message ?? String(cause),
      ...(c.code ? { code: c.code } : {}),
      ...(c.address ? { address: `${c.address}:${c.port ?? "?"}` } : {}),
    });
    cause = c.cause;
  }

  return chain;
}

/**
 * `onError` handler for the tRPC Express adapter.
 *
 * Only genuine server faults are logged here — client mistakes (auth,
 * validation, not found) are already recorded at `warn` by the procedure
 * middleware in `trpc.ts`, and logging them again at `error` would bury the
 * failures that matter.
 */
export function logTrpcError(opts: {
  path?: string;
  error: { code?: string; cause?: unknown };
}) {
  const { path, error } = opts;
  if (error.code && error.code !== "INTERNAL_SERVER_ERROR") return;

  const causes = flattenCauses(error);
  logger.error("trpc internal error", {
    procedure: path ?? null,
    err: error.cause ?? error,
    ...(causes.length ? { causes } : {}),
  });
}

/**
 * What a client is allowed to be told about a server fault.
 *
 * A user of this app once saw, in a toast:
 *
 * > Failed query: select "id", "openId", "name", "email", "passwordHash", …
 * > from "users" where "users"."email" = $1 params: someone@example.com,1
 *
 * That is drizzle's message for any failed query, and tRPC puts a thrown
 * error's message straight into the response. It publishes the table's column
 * list — `passwordHash` included — and the address of whoever was signing in,
 * while telling them nothing they could act on.
 *
 * So an unexpected failure gets a generic sentence and a reference. The detail
 * is not lost: `logTrpcError` already flattens the whole cause chain onto a log
 * entry, and the reference here is the request id that entry carries, so a
 * screenshot from a user leads straight to the record.
 *
 * **Only errors tRPC wrapped are rewritten.** A hand-written
 * `new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: … })` carries no
 * `cause` and keeps its message — `auth.me` uses exactly that shape to say
 * "Could not verify your session", which is written for a person to read. Every
 * other code (BAD_REQUEST, FORBIDDEN, NOT_FOUND …) is a deliberate message too
 * and is never touched; the client matches on some of them by exact string.
 *
 * Local development keeps the raw message, because there the developer is the
 * user and the detail is the point.
 */
export function clientSafeMessage(
  error: { code?: string; message?: string; cause?: unknown },
  requestId?: string
): string | null {
  if (error.code !== "INTERNAL_SERVER_ERROR") return null;
  // No cause means nobody wrapped anything: this message was written on purpose.
  if (!error.cause) return null;
  if (!config.isDeployed) return null;

  return requestId
    ? `Something went wrong on our end. Please try again. (ref: ${requestId})`
    : "Something went wrong on our end. Please try again.";
}

/**
 * A readable sentence for input that failed validation, or null.
 *
 * tRPC reports an input-validation failure as a `BAD_REQUEST` whose `cause` is
 * the `ZodError`, and a `ZodError`'s own message is `JSON.stringify` of its
 * issues. So typing a malformed address produced, in a toast:
 *
 * > [\n  {\n    "origin": "string",\n    "code": "invalid_format",\n
 * >     "format": "email",\n    "pattern": "/^(?!\\.)(?!.*\\.\\.)…
 *
 * which is a schema dump where a sentence belongs. `zod-validation-error` turns
 * the same issues into `Invalid email address at "email"`. It was already a
 * dependency and unused, so this adds nothing to the tree.
 *
 * Applied everywhere, not only when deployed: unlike the internal-error case
 * there is nothing to hide here, and the readable form is better for whoever is
 * reading it.
 *
 * Capped at three issues. A form with eight problems produces eight clauses
 * joined by semicolons, and nobody reads the eighth — the first few are what
 * gets somebody moving.
 */
export function readableValidationMessage(error: {
  code?: string;
  cause?: unknown;
}): string | null {
  if (error.code !== "BAD_REQUEST") return null;
  if (!isZodErrorLike(error.cause)) return null;
  return fromError(error.cause, {
    prefix: null,
    maxIssuesInMessage: 3,
  }).message;
}
