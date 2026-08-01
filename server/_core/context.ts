import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema.js";
import { logger, type Logger } from "./logger.js";
import { sdk } from "./sdk.js";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** Correlates this call with the surrounding HTTP request in the logs. */
  requestId: string;
  /** Pre-bound logger; prefer this over importing `logger` inside procedures. */
  log: Logger;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  const requestId = opts.req.requestId ?? "unknown";
  const log = logger.child({ requestId });

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    requestId,
    log: user ? log.child({ userId: user.id }) : log,
  };
}
