/**
 * Long-running server entrypoint (local development and container hosts).
 * The Vercel serverless entrypoint is `api/server.ts`; both build the same app
 * via `createApp`.
 */
import { createApp } from "./app";
import { config, describeConfig } from "./env";
import { installProcessLogging } from "./httpLogging";
import { logger } from "./logger";

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
