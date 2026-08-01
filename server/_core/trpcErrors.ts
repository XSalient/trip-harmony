/**
 * Database and network failures surface as a generic "Failed query" from
 * drizzle, with the useful part (pg error code, host, port) buried in the
 * cause chain. Log the whole chain so production failures are diagnosable
 * from the platform logs.
 */
export function logTrpcError(opts: { path?: string; error: unknown }) {
  const { path, error } = opts;
  console.error(`[tRPC] ${path ?? "<no path>"} failed:`, error);

  let cause: unknown = (error as { cause?: unknown })?.cause;
  let depth = 0;
  while (cause && depth < 5) {
    const c = cause as {
      message?: string;
      code?: string;
      address?: string;
      port?: number;
      cause?: unknown;
    };
    console.error(
      `[tRPC] ...caused by: ${c.message ?? String(cause)}` +
        (c.code ? ` (code=${c.code})` : "") +
        (c.address ? ` address=${c.address}:${c.port ?? "?"}` : "")
    );
    cause = c.cause;
    depth += 1;
  }
}
