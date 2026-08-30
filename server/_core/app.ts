/**
 * Builds the Express app.
 *
 * Shared by both runtimes so they can never drift:
 *  - `server/_core/index.ts` — long-running Node server (local dev, any container host)
 *  - `api/server.ts`         — Vercel serverless function
 *
 * The only difference between them is how static assets are served, which is
 * why `serveClient` is a flag rather than a fork of this file.
 */
import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers/index.js";
import { createContext } from "./context.js";
import { withRequestCache } from "./requestCache.js";
import { config, describeConfig } from "./env.js";
import { errorLogging, requestLogging } from "./httpLogging.js";
import { handleRevenueCatWebhook } from "../utils/revenueCatWebhook.js";
import { registerWellKnownRoutes } from "./wellKnown.js";
import { registerOAuthRoutes } from "./oauth.js";
import { logTrpcError } from "./trpcErrors.js";

export type CreateAppOptions = {
  /**
   * Serve the built SPA (production) or attach the Vite dev middleware
   * (development). Vercel serves static assets itself, so it passes `false`.
   */
  serveClient?: boolean;
};

export async function createApp({
  serveClient = false,
}: CreateAppOptions = {}): Promise<{
  app: Express;
  server: Server;
}> {
  const app = express();
  const server = createServer(app);

  app.set("trust proxy", true);
  app.use(requestLogging());

  // Generous limit: proposals can carry inlined images.
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Liveness/readiness probe. Intentionally leaks nothing sensitive.
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      ...describeConfig(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    });
  });

  /**
   * The files Apple and Google fetch to believe a link belongs to this app.
   *
   * Registered before the SPA fallback and reached through an explicit rewrite
   * in `vercel.json`, because the catch-all there would otherwise serve them
   * the HTML shell — with a 200, to a fetcher expecting JSON, which is the
   * silent version of this being broken.
   */
  registerWellKnownRoutes(app);

  /**
   * RevenueCat's webhook — the only thing that records a purchase.
   *
   * A plain Express route because RevenueCat posts JSON to a URL and knows
   * nothing about tRPC, and outside the `/api/trpc` mount for the same reason.
   * It authenticates with a shared secret rather than a session: the caller is
   * a server, not a signed-in person.
   */
  app.post("/api/billing/webhook", handleRevenueCatWebhook);

  registerOAuthRoutes(app);

  // Everything under here shares one membership cache, which is the point:
  // the client batches, so a trip page arrives as eight or ten procedures in a
  // single request, each of which used to ask `getTripMember` the same
  // question. See `_core/requestCache.ts`.
  app.use("/api/trpc", (_req, _res, next) => {
    withRequestCache(async () => next());
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      // Flattens the cause chain — pg errors hide the useful detail there.
      onError: logTrpcError,
    })
  );

  if (serveClient) {
    // Imported lazily: this module pulls in Vite, which must not be bundled
    // into the serverless function.
    const { serveStatic, setupVite } = await import("./vite");
    if (config.appEnv === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }
  }

  app.use(errorLogging());

  return { app, server };
}
