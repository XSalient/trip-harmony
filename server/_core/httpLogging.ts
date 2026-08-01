/**
 * Express middleware that gives every request a correlation id and one
 * structured log line on completion.
 *
 * The id is echoed back as the `x-request-id` response header, so a user can
 * paste it from the browser network tab into a log search and land on the exact
 * request. Inbound `x-request-id` values are honoured, which keeps traces intact
 * behind Vercel's edge.
 */
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { logger } from "./logger.js";

/** Paths that would otherwise flood the log with noise in development. */
const IGNORED_PREFIXES = [
  "/@vite",
  "/@react-refresh",
  "/src/",
  "/node_modules/",
  "/__manus__",
];

function shouldSkip(url: string) {
  return IGNORED_PREFIXES.some(prefix => url.startsWith(prefix));
}

export function requestLogging() {
  return (req: Request, res: Response, next: NextFunction) => {
    const inbound = req.header("x-request-id");
    const requestId = inbound && inbound.length <= 200 ? inbound : randomUUID();
    req.requestId = requestId;
    res.setHeader("x-request-id", requestId);

    if (shouldSkip(req.originalUrl)) return next();

    const startedAt = process.hrtime.bigint();

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const fields = {
        requestId,
        method: req.method,
        path: req.originalUrl.split("?")[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      };
      if (res.statusCode >= 500) logger.error("http request failed", fields);
      else if (res.statusCode >= 400)
        logger.warn("http request rejected", fields);
      else logger.info("http request", fields);
    });

    next();
  };
}

/** Terminal error handler: logs the stack, returns a safe body with the request id. */
export function errorLogging() {
  return (err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    const requestId = req.requestId;
    logger.error("unhandled request error", {
      requestId,
      path: req.originalUrl,
      err,
    });
    res.status(500).json({
      error: "Internal Server Error",
      requestId,
    });
  };
}

/**
 * Log crashes that would otherwise kill the process silently.
 * Registered once at boot.
 */
export function installProcessLogging() {
  process.on("unhandledRejection", reason => {
    logger.error("unhandled promise rejection", { err: reason });
  });
  process.on("uncaughtException", err => {
    logger.error("uncaught exception", { err });
  });
}
