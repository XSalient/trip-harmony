/**
 * Command line and safety policy for `pnpm seed:demo`.
 *
 * Everything here is pure so the policy can be tested without a database. The
 * runner in `scripts/seed-demo.ts` does the talking to Postgres and asks this
 * module whether it is allowed to.
 *
 * The policy exists because a seeder is a delete followed by an insert, and the
 * delete is the dangerous half. `DATABASE_URL` is whatever the shell last
 * exported — `doppler run --config prd -- pnpm seed:demo` is one tab away from
 * `--config dev`, and nothing in the command itself says which database it
 * reached. So the target has to earn the write rather than be assumed safe.
 */

// The prefixes live in `shared/` because the landing page needs them too: it
// asks whether the demo trip exists before offering a button that leads to it.
export {
  DEFAULT_DEMO_PASSWORD,
  DEMO_EMAIL_DOMAIN,
  DEMO_INVITE_CODE_PREFIX,
  DEMO_OPEN_ID_PREFIX,
  DEMO_PASSWORD_ENV_VAR,
} from "../../shared/demo.js";

import {
  DEFAULT_DEMO_PASSWORD,
  DEMO_INVITE_CODE_PREFIX,
  DEMO_OPEN_ID_PREFIX,
  DEMO_PASSWORD_ENV_VAR,
  isUsableDemoPassword,
} from "../../shared/demo.js";

export type DemoMode = "seed" | "clean";

export interface DemoOptions {
  mode: DemoMode;
  password: string;
  /** True when `--password` was given rather than defaulted. */
  passwordWasGiven: boolean;
  allowRemote: boolean;
  allowProduction: boolean;
  help: boolean;
}

export class UsageError extends Error {}

/**
 * `DEMO_PASSWORD_ENV_VAR` is the environment variable a password may arrive in
 * instead of `--password=`.
 *
 * Seeding a shared environment means reaching for a password that lives in a
 * secret manager, and getting it onto the command line means a shell doing the
 * expanding. That is where this goes wrong: `sh -c` is not a thing on Windows,
 * `%VAR%` expands before the secret exists, and whichever form you land on,
 * the password ends up echoed in a terminal and in the package runner's log.
 *
 * Reading it from the environment makes the whole problem disappear —
 * `doppler run … -- pnpm seed:demo --allow-production` is the same command on
 * every operating system, and the secret never becomes an argument.
 *
 * It and `isUsableDemoPassword` live in `shared/demo.ts`, because the admin
 * reset button applies the same rule from the server and neither side should
 * import the other.
 */
export function parseArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): DemoOptions {
  const fromEnv = env[DEMO_PASSWORD_ENV_VAR]?.trim();
  const usableFromEnv = isUsableDemoPassword(fromEnv) ? fromEnv : undefined;

  const options: DemoOptions = {
    mode: "seed",
    password: usableFromEnv ?? DEFAULT_DEMO_PASSWORD,
    // An environment password counts as given: it was put there on purpose,
    // and it is not the one published in this file.
    passwordWasGiven: usableFromEnv !== undefined,
    allowRemote: false,
    allowProduction: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--clean") options.mode = "clean";
    else if (arg === "--allow-remote") options.allowRemote = true;
    else if (arg === "--allow-production") options.allowProduction = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg.startsWith("--password=")) {
      const value = arg.slice("--password=".length);
      if (value.length < 8) {
        throw new UsageError("--password needs at least 8 characters.");
      }
      options.password = value;
      options.passwordWasGiven = true;
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

/**
 * Whether a connection string points at a database on this machine.
 *
 * Mirrors `isLocalUrl` in `server/db.ts` and is deliberately conservative: a
 * host it cannot recognise is remote, because the failure that matters is
 * calling a production host local, not the other way round.
 */
export function isLocalDatabase(url: string): boolean {
  const host = databaseHost(url);
  if (!host) return false;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host === "host.docker.internal"
  );
}

/** The host of a Postgres URL, or null when it cannot be read as one. Never returns credentials. */
export function databaseHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export interface RunTarget {
  appEnv: string;
  databaseUrl: string;
}

export type RunDecision =
  | { allowed: true; local: boolean; host: string | null }
  | { allowed: false; reason: string };

/**
 * The one place that decides whether this seeding run may proceed.
 *
 * The ladder is: a database has to exist, a database that is not on this
 * machine has to be named out loud, production has to be named twice, and a
 * production run may not use the password that is written down in this file.
 */
export function decideRun(
  target: RunTarget,
  options: DemoOptions
): RunDecision {
  if (!target.databaseUrl) {
    return {
      allowed: false,
      reason:
        "No Postgres connection string is configured. Set DATABASE_URL, or run " +
        "through Doppler: doppler run --config dev -- pnpm seed:demo",
    };
  }

  const host = databaseHost(target.databaseUrl);
  const local = isLocalDatabase(target.databaseUrl);

  if (target.appEnv === "production" && !options.allowProduction) {
    return {
      allowed: false,
      reason:
        `APP_ENV is "production" and the database is ${host ?? "unreadable"}. ` +
        "Seeding writes fictional people and trips, and removes anything it " +
        "wrote before. Pass --allow-production --password=… if that is genuinely " +
        "what you want.",
    };
  }

  if (!local && !options.allowRemote && !options.allowProduction) {
    return {
      allowed: false,
      reason:
        `The database is ${host ?? "not on this machine"}, not localhost. ` +
        "Pass --allow-remote if you meant to seed a shared environment.",
    };
  }

  if (options.allowProduction && !options.passwordWasGiven) {
    return {
      allowed: false,
      reason:
        "Refusing to seed production with the default password, which is " +
        "published in scripts/demo/options.ts and in the runbook. Pass " +
        `--password=… with something the internet does not already know, or ` +
        `set ${DEMO_PASSWORD_ENV_VAR} — a secret manager can supply that one ` +
        "without it ever becoming a command-line argument.",
    };
  }

  return { allowed: true, local, host };
}

export const USAGE = `
Seed the marketing demo: three trips, eleven people, and the votes, arguments
and AI mediation that make the screens worth photographing.

  pnpm seed:demo [options]

  --clean               Remove the demo data and stop. Creates nothing.
  --password=…          Sign-in password for the demo accounts.
                        Default: ${DEFAULT_DEMO_PASSWORD}
  --allow-remote        Required when the database is not on this machine.
  --allow-production    Required when APP_ENV=production. Needs a password.
  -h, --help            This text.

${DEMO_PASSWORD_ENV_VAR} sets the password too, and is the better way to reach
a shared environment: it works the same on every operating system and keeps the
secret out of your shell history. With it set, the whole command is

  doppler run --project trip-harmony --config demo -- pnpm seed:demo --allow-production

Seeding is idempotent: it removes what a previous run created before it
writes, so running it twice leaves one copy of the demo, not two. It only ever
touches rows it owns — users whose openId starts "${DEMO_OPEN_ID_PREFIX}" and trips whose
invite code starts "${DEMO_INVITE_CODE_PREFIX}". Real accounts and real trips are never read or
written.
`.trim();
