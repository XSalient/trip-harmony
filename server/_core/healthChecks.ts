/**
 * What is actually working, as opposed to what is configured.
 *
 * `/api/health` and `describeConfig()` answer a different, cheaper question:
 * "is the variable set?" That question has now been wrong twice in ways that
 * cost real deliveries — `ai: "configured"` while every request 404'd because
 * the model had been retired, and `email: "configured"` while Resend was
 * unreachable and a trip's invitations went nowhere. A variable being present
 * is not evidence that the thing behind it answers.
 *
 * So these checks talk to the dependency. That is also why they are restricted
 * to the **system** admin — `users.role === "admin"`, the operator, never
 * `trip_members.role`, which is a customer running a holiday — and never run on
 * a schedule: each one costs an outbound request, and an endpoint that makes
 * outbound requests for anyone who asks is a way to spend somebody else's rate
 * limit.
 *
 * Nothing here throws. A check that cannot run reports that it could not run —
 * a diagnostics screen that 500s tells you nothing about the thing you came to
 * diagnose.
 */
import { sql } from "drizzle-orm";

import { config, describeConfig } from "./env.js";
import * as db from "../db.js";
import { describeError, probeEmail } from "../utils/mailer.js";

/**
 * `warn` is for something that works now but will bite: a store submission
 * that is missing its legal block, a deployment whose APP_ENV lies. `unknown`
 * is for a check that could not reach a verdict — never quietly folded into
 * `ok`, because "we did not look" and "we looked and it was fine" are the two
 * answers this whole module exists to keep apart.
 */
export type CheckStatus = "ok" | "warn" | "fail" | "off" | "unknown";

export type Check = {
  id: string;
  label: string;
  status: CheckStatus;
  /** One line, in words an operator can act on. */
  summary: string;
  /** What to do about it, when there is something to do. */
  detail?: string;
  /** Supporting values. Names and states only — never a secret. */
  facts?: Record<string, string | number | null>;
};

export type HealthReport = {
  checkedAt: string;
  /** The worst status in `checks`, so a caller does not have to re-derive it. */
  overall: CheckStatus;
  durationMs: number;
  checks: Check[];
};

/** Worst-first, so `overall` is a fold and the UI can sort by the same rank. */
const SEVERITY: Record<CheckStatus, number> = {
  fail: 4,
  warn: 3,
  unknown: 2,
  ok: 1,
  off: 0,
};

function worst(checks: Check[]): CheckStatus {
  return checks.reduce<CheckStatus>(
    (acc, c) => (SEVERITY[c.status] > SEVERITY[acc] ? c.status : acc),
    "ok"
  );
}

/**
 * A check that throws is a bug in the check, not a verdict about the
 * dependency — so it is reported as its own failure rather than being allowed
 * to take the page down with it.
 */
async function guard(
  id: string,
  label: string,
  run: () => Promise<Check>
): Promise<Check> {
  try {
    return await run();
  } catch (err) {
    return {
      id,
      label,
      status: "unknown",
      summary: "This check could not run",
      detail: describeError(err),
    };
  }
}

/** Postgres answers, and how long it took to say so. */
async function checkDatabase(): Promise<Check> {
  const facts: Record<string, string | number | null> = {
    source: config.db.source || null,
    poolMax: config.db.poolMax,
  };

  if (!config.db.isConfigured) {
    return {
      id: "database",
      label: "Database",
      status: "fail",
      summary: "No Postgres URL is configured",
      detail:
        "Set DATABASE_URL. Every request that touches data fails until then.",
      facts,
    };
  }

  const startedAt = Date.now();
  const conn = await db.getDb();
  if (!conn) {
    return {
      id: "database",
      label: "Database",
      status: "fail",
      summary: "The connection pool could not be created",
      detail:
        "A URL is configured but the pool failed to build — look for 'failed to create connection pool' in the logs.",
      facts,
    };
  }
  await conn.execute(sql`select 1`);
  facts.latencyMs = Date.now() - startedAt;

  // Not a threshold anybody tuned — it is the point past which a page that
  // makes several queries feels broken rather than slow.
  const slow = Number(facts.latencyMs) > 800;
  return {
    id: "database",
    label: "Database",
    status: slow ? "warn" : "ok",
    summary: slow
      ? `Reachable, but a trivial query took ${facts.latencyMs}ms`
      : `Reachable in ${facts.latencyMs}ms`,
    detail: slow
      ? "A round trip this slow usually means the pool is saturated or the region is far from the database."
      : undefined,
    facts,
  };
}

/**
 * Which migrations the *database* believes it has.
 *
 * Deliberately not "are you up to date": answering that needs the migration
 * journal from the repository, and the serverless entrypoint runs an import
 * graph that does not include the `drizzle/` folder. Reporting a confident
 * "up to date" that was computed from a journal that may not be there would be
 * the same class of lie this module exists to stop. The applied count and the
 * newest tag are facts the database itself holds, and an operator can compare
 * them with `drizzle/meta/_journal.json` in one glance.
 */
async function checkMigrations(): Promise<Check> {
  const conn = await db.getDb();
  if (!conn) {
    return {
      id: "migrations",
      label: "Migrations",
      status: "unknown",
      summary: "Not checked — there is no database connection",
      detail: "Fix the database check first; this one reads from Postgres.",
    };
  }
  let rows: Array<{ applied: unknown; newest: unknown }>;
  try {
    const result = await conn.execute(
      sql`select count(*)::int as applied, max(created_at) as newest from drizzle.__drizzle_migrations`
    );
    rows = result.rows as Array<{ applied: unknown; newest: unknown }>;
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 42P01 undefined_table, 3F000 invalid_schema_name — the same two cases
    // `scripts/lib/migrations.mjs` treats as "nothing applied yet".
    if (code === "42P01" || code === "3F000") {
      return {
        id: "migrations",
        label: "Migrations",
        status: "fail",
        summary: "This database has no migration history",
        detail:
          "Nothing has ever been applied to it, so the schema cannot match the code. Run pnpm db:push against it, or check DATABASE_URL points where you think it does.",
      };
    }
    throw err;
  }

  const applied = Number(rows[0]?.applied ?? 0);
  const newestRaw = rows[0]?.newest;
  const newest =
    newestRaw == null ? null : new Date(Number(newestRaw)).toISOString();

  return {
    id: "migrations",
    label: "Migrations",
    status: applied > 0 ? "ok" : "fail",
    summary:
      applied > 0
        ? `${applied} applied, most recent ${newest ?? "at an unknown time"}`
        : "No migrations have been applied",
    detail:
      "Compare the count with drizzle/meta/_journal.json. The server cannot do that for you — the deployed function does not carry the migrations folder.",
    facts: { applied, newestAppliedAt: newest },
  };
}

/** The check the invite outage needed and nobody had. */
async function checkEmail(): Promise<Check> {
  const probe = await probeEmail();
  const status: CheckStatus =
    probe.verdict === "ok"
      ? "ok"
      : probe.verdict === "unknown"
        ? "unknown"
        : "fail";

  return {
    id: "email",
    label: "Email delivery",
    status,
    summary: probe.summary,
    detail: probe.detail,
    facts: { provider: probe.provider, ...probe.facts },
  };
}

/**
 * Whether the configured model still exists for this key.
 *
 * A models lookup rather than a generation: it costs nothing, and the failure
 * it is here to catch — a model retired on the vendor's schedule — shows up in
 * the lookup exactly as it would in a real call.
 */
async function checkAi(): Promise<Check> {
  const facts: Record<string, string | number | null> = {
    model: config.ai.model,
    keySource: config.ai.keySource || null,
  };

  if (!config.ai.enabled) {
    return {
      id: "ai",
      label: "AI",
      status: "off",
      summary: "Switched off with AI_ENABLED",
      facts,
    };
  }
  if (!config.ai.hasKey) {
    return {
      id: "ai",
      label: "AI",
      status: "fail",
      summary: "Enabled, but no API key is set",
      detail:
        "Set AI_INTEGRATIONS_GEMINI_API_KEY, or switch the feature off with AI_ENABLED=false so the UI stops offering it.",
      facts,
    };
  }
  if (config.ai.apiUrl) {
    // A proxy base URL means requests do not go to Google, so a Google models
    // lookup would be testing something the app never calls.
    return {
      id: "ai",
      label: "AI",
      status: "unknown",
      summary: `Key set, routed through a custom base URL`,
      detail:
        "Requests go through BUILT_IN_FORGE_API_URL rather than Google, so the model could not be verified from here.",
      facts: { ...facts, baseUrl: config.ai.apiUrl },
    };
  }

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.ai.model)}`,
      { headers: { "x-goog-api-key": config.ai.apiKey } }
    );
  } catch (err) {
    return {
      id: "ai",
      label: "AI",
      status: "fail",
      summary: "Google's API is unreachable from this server",
      detail: describeError(err),
      facts,
    };
  }
  facts.latencyMs = Date.now() - startedAt;

  if (res.status === 404) {
    return {
      id: "ai",
      label: "AI",
      status: "fail",
      summary: `The model "${config.ai.model}" does not exist for this key`,
      detail:
        "This is how AI broke before: a model was retired on the vendor's schedule while the health check still said configured. Point AI_MODEL at a current model.",
      facts,
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      id: "ai",
      label: "AI",
      status: "fail",
      summary: "Google rejected the API key",
      detail: `Responded ${res.status}. The key is wrong, revoked, or not entitled to this model.`,
      facts,
    };
  }
  if (!res.ok) {
    return {
      id: "ai",
      label: "AI",
      status: "unknown",
      summary: `Google responded ${res.status}`,
      facts,
    };
  }

  return {
    id: "ai",
    label: "AI",
    status: "ok",
    summary: `"${config.ai.model}" is available to this key`,
    facts,
  };
}

/**
 * The environment lying about itself.
 *
 * `APP_ENV=development` on the production deployment has now caused three
 * bugs: a sign-in link handed back in an API response, internal error text
 * reaching browsers, and invite failures that did not raise. Each was fixed by
 * moving that decision to `onDeployedPlatform`. The variable is still set, and
 * it still turns on debug logging in production — so it gets a row of its own
 * rather than waiting for a fourth.
 */
function checkEnvironment(): Check {
  const lying = config.onDeployedPlatform && config.appEnv !== "production";
  return {
    id: "environment",
    label: "Environment",
    status: lying ? "warn" : "ok",
    summary: lying
      ? `A hosting platform is running this, but APP_ENV says "${config.appEnv}"`
      : `APP_ENV is "${config.appEnv}"`,
    detail: lying
      ? "Anything keyed on APP_ENV behaves as though this were a laptop: debug logging, human-formatted logs, and any future check that reaches for isProduction. Remove APP_ENV from the hosting project — but confirm JWT_SECRET is at least 32 characters first, because removing it starts enforcing the deployed schema, which throws at boot."
      : undefined,
    facts: {
      appEnv: config.appEnv,
      onDeployedPlatform: String(config.onDeployedPlatform),
      logLevel: config.logLevel,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
  };
}

/** Session signing. A short secret is a real weakness, not a style note. */
function checkAuth(): Check {
  const secret = config.auth.cookieSecret;
  if (!secret) {
    return {
      id: "auth",
      label: "Sessions",
      status: "fail",
      summary: "No session secret is set",
      detail: "Set JWT_SECRET. Sessions cannot be signed without it.",
    };
  }
  const short = secret.length < 32;
  return {
    id: "auth",
    label: "Sessions",
    status: short ? "warn" : "ok",
    summary: short
      ? `The session secret is ${secret.length} characters`
      : "Session secret set",
    detail: short
      ? "The deployed schema requires at least 32. Until it is lengthened, removing APP_ENV from the hosting project would stop the server booting."
      : undefined,
    facts: { length: secret.length },
  };
}

/** The listing scraper: off on purpose, never set up, or working. */
function checkScraper(): Check {
  const described = describeConfig();
  const state = described.scraper;
  return {
    id: "scraper",
    label: "Listing scraper",
    status:
      state === "off"
        ? "off"
        : state === "disabled" || state === "misconfigured"
          ? "warn"
          : "ok",
    summary:
      state === "off"
        ? "Switched off with SCRAPER_ENABLED"
        : state === "disabled"
          ? "Enabled, but no usable provider is configured"
          : state === "misconfigured"
            ? "A provider is set but its settings do not resolve"
            : `Running on ${state}`,
    detail: described.scraperError,
    facts: { provider: state },
  };
}

/**
 * What an app-store submission needs and this deployment does not have.
 * Warnings, not failures: the app runs fine without them, right up until
 * somebody tries to submit it.
 */
function checkStoreReadiness(): Check {
  const missing: string[] = [];
  if (!config.supportEmail) missing.push("support email");
  if (!config.legal.isComplete)
    missing.push("legal entity/jurisdiction/address");
  if (!config.native.isConfigured) missing.push("native app identifiers");

  return {
    id: "store",
    label: "Store readiness",
    status: missing.length > 0 ? "warn" : "ok",
    summary:
      missing.length > 0
        ? `Missing: ${missing.join(", ")}`
        : "Support address, legal block and native identifiers all set",
    detail:
      missing.length > 0
        ? "A submission needs all three; see docs/runbooks/launch.md. Nothing in the running app depends on them."
        : undefined,
  };
}

/** Purchases. `missing` matters only once billing is switched on. */
function checkBilling(): Check {
  if (!config.billing.enabled) {
    return {
      id: "billing",
      label: "Billing",
      status: "off",
      summary: "Switched off with BILLING_ENABLED",
    };
  }
  const ok = config.billing.isConfigured;
  return {
    id: "billing",
    label: "Billing",
    status: ok ? "ok" : "fail",
    summary: ok
      ? "RevenueCat keys are set"
      : "Enabled, but its keys are not set",
    detail: ok
      ? undefined
      : "Purchases and the webhook that records them cannot work. Set the RevenueCat secret and webhook secret, or switch billing off.",
  };
}

/**
 * Runs everything in parallel — they are independent, and a diagnostics screen
 * that takes the sum of six network round trips is one nobody opens twice.
 */
export async function runHealthChecks(): Promise<HealthReport> {
  const startedAt = Date.now();

  const checks = await Promise.all([
    guard("database", "Database", checkDatabase),
    guard("migrations", "Migrations", checkMigrations),
    guard("email", "Email delivery", checkEmail),
    guard("ai", "AI", checkAi),
    guard("environment", "Environment", async () => checkEnvironment()),
    guard("auth", "Sessions", async () => checkAuth()),
    guard("scraper", "Listing scraper", async () => checkScraper()),
    guard("store", "Store readiness", async () => checkStoreReadiness()),
    guard("billing", "Billing", async () => checkBilling()),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    overall: worst(checks),
    durationMs: Date.now() - startedAt,
    checks,
  };
}
