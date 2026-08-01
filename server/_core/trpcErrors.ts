/**
 * Database and network failures surface as a generic "Failed query" from
 * drizzle, with the useful part (pg error code, host, port) buried in the
 * cause chain. Flatten the whole chain onto the log entry so a production
 * failure is diagnosable from the platform logs without a reproduction.
 */
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
