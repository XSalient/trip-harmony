/**
 * App-wide administration. Not trip administration — that is a role held per
 * trip and lives on `trip_members`. This is `users.role === "admin"`, which is
 * held by a person rather than by a membership, and is what `adminProcedure`
 * checks.
 */
import { TRPCError } from "@trpc/server";

import { adminProcedure, router } from "../_core/trpc.js";
import {
  DEMO_PEOPLE_COUNT,
  runDemoSeed,
  type DemoSeedResult,
} from "../demo/seed.js";
import {
  DEMO_PASSWORD_ENV_VAR,
  isUsableDemoPassword,
} from "../../shared/demo.js";

/**
 * One reset at a time.
 *
 * A reset deletes the demo and rebuilds it. Two of them interleaved would have
 * the second delete rows the first was midway through writing, and the demo
 * would end up neither the old one nor the new one. Two people clicking during
 * the same call is an ordinary thing to happen, not a race worth being clever
 * about, so the second caller is simply told to wait.
 */
let inFlight: Promise<DemoSeedResult> | null = null;

export const adminRouter = router({
  /**
   * Put the demo back exactly as it was seeded.
   *
   * Everything a visitor did to it — votes, comments, a finalised
   * accommodation — goes, and the three trips come back as the story intends
   * them. Real accounts and real trips are never touched: `runDemoSeed` only
   * removes rows carrying the demo prefixes.
   */
  resetDemo: adminProcedure.mutation(async () => {
    const password = process.env[DEMO_PASSWORD_ENV_VAR]?.trim();

    // Deliberately no fallback to the published default. On a deployed
    // environment that would quietly give every seeded account a password
    // printed in the runbook, and nothing would look wrong. This is the same
    // rule the CLI applies to the same variable.
    if (!isUsableDemoPassword(password)) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          `${DEMO_PASSWORD_ENV_VAR} is not usable on this server, so the demo ` +
          "cannot be rebuilt. It must be set, at least 8 characters, and not " +
          "the password published in the runbook. It lives in the demo config " +
          "of the secret manager; the deployment needs it too.",
      });
    }

    if (inFlight) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A demo reset is already running. Give it a few seconds.",
      });
    }

    inFlight = runDemoSeed({ password, mode: "seed" });
    try {
      const result = await inFlight;
      return {
        removed: result.removed,
        trips: result.seeded,
        // What the CLI reports, in the same words. A row count would be a
        // larger number that answers a question nobody asked — "three trips
        // and eleven people" is the thing an admin can check against the screen
        // in front of them.
        people: DEMO_PEOPLE_COUNT,
      };
    } finally {
      inFlight = null;
    }
  }),
});
