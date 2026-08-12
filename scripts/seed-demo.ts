#!/usr/bin/env tsx
/**
 * Seeds the marketing demo from a terminal.
 *
 *   pnpm seed:demo            seed a local database
 *   pnpm seed:demo --clean    remove the demo data again
 *   pnpm seed:demo --help     the flags, including the ones that unlock a
 *                             non-local target
 *
 * The demo itself is built by `server/demo/seed.ts`, which the app's admin
 * reset button also calls. What lives here is everything that only makes sense
 * at a terminal: reading arguments, deciding whether a run may proceed, and
 * printing what happened.
 *
 * TypeScript rather than the `.mjs` the rest of `scripts/` uses, for the same
 * reason as `diagnose-listing-url.ts`: nothing in a deploy runs it, so it never
 * has to work before the toolchain is installed, and it gets to share the
 * schema types with the server instead of restating them.
 *
 * It will not write to a database it was not told twice about — see `decideRun`
 * in `demo/options.ts`.
 */

import { config } from "../server/_core/env.js";
import { DEMO_PEOPLE_COUNT, runDemoSeed } from "../server/demo/seed.js";
import {
  DEFAULT_DEMO_PASSWORD,
  USAGE,
  UsageError,
  decideRun,
  parseArgs,
  type DemoOptions,
} from "./demo/options.js";

function say(message = "") {
  process.stdout.write(`${message}\n`);
}

async function main() {
  let options: DemoOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      say(`${error.message}\n\n${USAGE}`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  if (options.help) {
    say(USAGE);
    return;
  }

  const decision = decideRun(
    { appEnv: config.appEnv, databaseUrl: config.db.url },
    options
  );
  if (!decision.allowed) {
    say(`Refusing to run.\n\n${decision.reason}`);
    process.exitCode = 1;
    return;
  }

  say(
    `Target: ${decision.host ?? "unknown host"} (${config.db.source}), APP_ENV=${config.appEnv}`
  );

  const result = await runDemoSeed({
    password: options.password,
    mode: options.mode,
  });

  if (result.removed.trips || result.removed.people) {
    say(
      `Removed the previous demo: ${result.removed.trips} trips, ${result.removed.people} people.`
    );
  }

  if (options.mode === "clean") {
    say("Done. Nothing was created.");
    return;
  }

  say();
  say(`Seeded ${result.seeded.length} trips and ${DEMO_PEOPLE_COUNT} people:`);
  for (const trip of result.seeded) {
    say(`  /trips/${trip.id}  ${trip.name}`);
  }
  say();
  for (const [key, value] of Object.entries(result.totals).sort()) {
    say(`  ${String(value).padStart(4)}  ${key}`);
  }
  say();
  say("Sign in as:");
  say(`  ${result.primaryEmail}`);
  say(`  ${options.password}`);
  if (options.password === DEFAULT_DEMO_PASSWORD) {
    say("  (the default — every seeded account shares it)");
  }
  say();
  say("Re-run to reset the demo to this state. `--clean` removes it.");
}

/**
 * Say what actually went wrong.
 *
 * A failed query arrives from the driver as "Failed query: select …" with the
 * real reason — refused, timed out, name not resolved, password rejected —
 * hidden on `cause`. On a first run against a shared database that reason is
 * the entire diagnosis, and printing the stack without it sends people looking
 * at the SQL, which is never where the problem is.
 */
function explain(error: unknown): string {
  const lines: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code = (current as NodeJS.ErrnoException).code;
    lines.push(`${current.message}${code ? `  [${code}]` : ""}`);
    current = (current as { cause?: unknown }).cause;
  }

  // Match against the whole chain: the driver reports "connection terminated
  // unexpectedly" innermost and the reason one level out, so testing only the
  // root misses the very case this exists for.
  const root = lines.join("\n") || String(error);
  const hint =
    /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|timeout|terminated/i.test(
      root
    )
      ? "\n\nThe database did not answer. That is a network path problem, not a\n" +
        "problem with this script: outbound Postgres on port 5432 is blocked on\n" +
        "plenty of office and home networks. Try another network or a phone\n" +
        "hotspot, or ask whoever runs the firewall. Supabase also answers on\n" +
        "6543 (transaction pooler), which is sometimes open when 5432 is not."
      : /password|authent|SASL|role .* does not exist/i.test(root)
        ? "\n\nThe database refused the credentials. Check DATABASE_URL in the\n" +
          "config you passed to `doppler run --config …`."
        : "";

  return (
    lines.map((l, i) => `${i === 0 ? "" : "  caused by: "}${l}`).join("\n") +
    hint
  );
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(error => {
    say(`Seeding failed: ${explain(error)}`);
    process.exit(1);
  });
