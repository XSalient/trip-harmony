/**
 * Request augmentation for the correlation id attached by `requestLogging()`.
 * Declared against the global `Express` namespace rather than
 * `express-serve-static-core`, which pnpm's isolated store does not expose
 * as a directly resolvable module name.
 */
declare namespace Express {
  interface Request {
    /** Correlation id for this request; also returned as the `x-request-id` header. */
    requestId?: string;
  }
}
