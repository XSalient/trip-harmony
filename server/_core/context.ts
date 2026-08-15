import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema.js";
import { HttpError } from "../../shared/_core/errors.js";
import { logger, type Logger } from "./logger.js";
import { sdk } from "./sdk.js";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /**
   * Set when the session could not be determined at all, as opposed to being
   * determined to be absent. See the catch in `createContext`.
   */
  authFailed?: boolean;
  /** Correlates this call with the surrounding HTTP request in the logs. */
  requestId: string;
  /** Pre-bound logger; prefer this over importing `logger` inside procedures. */
  log: Logger;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let authFailed = false;

  const requestId = opts.req.requestId ?? "unknown";
  const log = logger.child({ requestId });

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;

    // `authenticateRequest` throws an `HttpError` for every verdict it reaches
    // itself — no cookie, a cookie that will not verify, a user it cannot sync.
    // Those mean signed out, and authentication is optional for public
    // procedures, so the request carries on without a user.
    //
    // Anything else is the session lookup failing rather than answering: a
    // dropped connection out of `getUserByOpenId`, a pool timeout, a cold
    // database. That is not a signed-out visitor and must not be reported as
    // one — protected procedures would answer "please login", and the client
    // redirects on exactly that, so a blip in the database logged people out
    // mid-trip. Flagged here and refused loudly by `requireUser`.
    if (!(error instanceof HttpError)) {
      authFailed = true;
      // The old catch swallowed this entirely, so the cause never reached the
      // logs — which is the other half of why it was hard to see.
      log.error("could not determine the session", { err: error });
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    authFailed,
    requestId,
    log: user ? log.child({ userId: user.id }) : log,
  };
}
