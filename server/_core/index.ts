/**
 * Long-running server entrypoint (local development and container hosts).
 * The Vercel serverless entrypoint is `api/server.ts`; both build the same app
 * via `createApp`.
 */
import { createApp } from "./app.js";
import { config, describeConfig } from "./env.js";
import { installProcessLogging } from "./httpLogging.js";
import { logger } from "./logger.js";

installProcessLogging();

createApp({ serveClient: true })
  .then(({ server }) => {
    server.listen(config.port, "0.0.0.0", () => {
      logger.info("server started", {
        url: `http://localhost:${config.port}/`,
        ...describeConfig(),
      });
    });
  })
  .catch(err => {
    logger.error("server failed to start", { err });
    process.exit(1);
  });
