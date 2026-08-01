/**
 * Vercel serverless entrypoint.
 *
 * Vercel serves the built SPA from `dist/public` directly, so this function
 * only handles `/api/*`. The app itself is built by the shared factory in
 * `server/_core/app.ts` — keep runtime-specific logic out of this file.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../server/_core/app.js";
import { installProcessLogging } from "../server/_core/httpLogging.js";

installProcessLogging();

// Built once per cold start, reused across invocations on the same instance.
const appPromise = createApp({ serveClient: false }).then(({ app }) => app);

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  const app = await appPromise;
  return app(req as never, res as never);
}
