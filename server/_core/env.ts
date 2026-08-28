/**
 * Single source of truth for server-side configuration.
 *
 * Every `process.env` read on the server belongs here. Values are validated
 * once at boot with Zod so a misconfigured deploy fails immediately with a
 * readable message instead of throwing something cryptic on the first request.
 *
 * Environment selection: `APP_ENV` (development | test | preview | production).
 * It falls back to Vercel's `VERCEL_ENV`, then `NODE_ENV`, so a plain
 * `NODE_ENV=production node dist/index.js` still behaves correctly.
 *
 * See docs/runbooks/environments.md for how each environment is provisioned.
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
// Pure, and imports nothing — the one module `env.ts` may depend on without
// creating the cycle every other server module would.
import { resolveScraperProvider } from "../utils/scraper/providers.js";

/**
 * Load local env files, most specific first. Already-set variables always win,
 * so Doppler/Vercel-injected values are never overwritten by a stale local file.
 * Deployed environments have no env files on disk and simply skip this.
 */
function loadEnvFiles() {
  // Tests must be hermetic: a developer's local .env (which may point at a real
  // database) must never bleed into a test run.
  if (process.env.VITEST) return;
  const root = process.cwd();
  const stage = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
  for (const name of [
    `.env.${stage}.local`,
    ".env.local",
    `.env.${stage}`,
    ".env",
  ]) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) dotenv.config({ path: file });
  }
}
loadEnvFiles();

export const APP_ENVS = [
  "development",
  "test",
  "preview",
  "production",
] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Names of variables whose values must never be logged, printed or serialised. */
export const SECRET_ENV_KEYS = [
  "JWT_SECRET",
  "DATABASE_URL",
  "BUILT_IN_FORGE_API_KEY",
  "AI_INTEGRATIONS_GEMINI_API_KEY",
  "SMTP_PASS",
  "SMTP_USER",
  "DOPPLER_TOKEN",
  "SCRAPER_API_KEY",
] as const;

function resolveAppEnv(): AppEnv {
  const explicit = process.env.APP_ENV;
  if (explicit && (APP_ENVS as readonly string[]).includes(explicit)) {
    return explicit as AppEnv;
  }
  // Vercel sets VERCEL_ENV to production | preview | development.
  const vercel = process.env.VERCEL_ENV;
  if (vercel === "preview") return "preview";
  if (vercel === "production") return "production";
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return "test";
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

const APP_ENV = resolveAppEnv();

// Keep NODE_ENV consistent with APP_ENV for the many libraries that branch on
// it. Doing this in code rather than in the npm script keeps `pnpm dev` working
// identically on Windows, macOS and Linux.
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV =
    APP_ENV === "production" || APP_ENV === "preview"
      ? "production"
      : APP_ENV === "test"
        ? "test"
        : "development";
}

/** Deployed environments must have real secrets; local/test may run degraded. */
const IS_DEPLOYED = APP_ENV === "production" || APP_ENV === "preview";

const optionalUrl = z
  .string()
  .trim()
  .refine(v => v === "" || /^https?:\/\//.test(v), {
    message: "must be an http(s) URL",
  })
  .default("");

const schema = z.object({
  APP_ENV: z.enum(APP_ENVS).default(APP_ENV),
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
  /** Where the app is reachable; used to build magic links and invite URLs. */
  PUBLIC_BASE_URL: optionalUrl,

  // --- Identity -----------------------------------------------------------
  VITE_APP_ID: z.string().trim().min(1).default("harmony"),
  JWT_SECRET: IS_DEPLOYED
    ? z
        .string()
        .min(32, "must be at least 32 characters in a deployed environment")
    : z.string().default(""),
  OAUTH_SERVER_URL: optionalUrl,
  OWNER_OPEN_ID: z.string().trim().default(""),

  // --- Data ---------------------------------------------------------------
  // Any one of these may carry the connection string; see `resolveDatabaseUrl`.
  // The "at least one in a deployed environment" rule is enforced below, since
  // no single field can express it.
  DATABASE_URL: z.string().trim().default(""),
  POSTGRES_URL: z.string().trim().default(""),
  POSTGRES_URL_NON_POOLING: z.string().trim().default(""),
  /**
   * How many Postgres connections one process may hold. Small by default
   * because the session pooler's slot budget is shared by every running
   * instance; `server/db.ts` explains the arithmetic. Raise it only against a
   * database this app has to itself.
   */
  DB_POOL_MAX: z.coerce.number().int().positive().max(100).default(3),

  // --- AI provider --------------------------------------------------------
  /**
   * A kill switch, independent of whether a key exists.
   *
   * Without it the only way to stop calling a provider is to remove its
   * credential, which conflates "pause this feature" with "rotate this secret"
   * and makes the pause hard to undo in a hurry. Unset means on.
   */
  AI_ENABLED: z.string().trim().default(""),
  /**
   * Which model to call. A variable rather than a constant because models are
   * retired on the vendor's schedule, not ours: `gemini-2.5-flash` was
   * hardcoded here and quietly stopped accepting new callers, so every AI
   * request 404'd while `/api/health` still said `ai: configured`. Moving to
   * the next model is now an environment edit.
   */
  AI_MODEL: z.string().trim().default(""),
  BUILT_IN_FORGE_API_URL: optionalUrl,
  BUILT_IN_FORGE_API_KEY: z.string().trim().default(""),
  AI_INTEGRATIONS_GEMINI_BASE_URL: optionalUrl,
  AI_INTEGRATIONS_GEMINI_API_KEY: z.string().trim().default(""),

  /**
   * Where a user writes when something has gone wrong, or when they want to
   * report something the in-app tools cannot reach.
   *
   * Apple's guideline 1.2 requires published contact information for an app
   * carrying user-generated content, and a privacy policy needs a contact point
   * of its own. Unset is allowed — the pages then say support is unavailable
   * rather than printing an empty `mailto:` — but a store submission needs it
   * set, which is why `/api/health` reports whether it is.
   */
  SUPPORT_EMAIL: z.string().trim().default(""),

  // --- Email --------------------------------------------------------------
  // Resend is tried first; SMTP is the fallback, because serverless platforms
  // commonly block outbound SMTP ports.
  RESEND_API_KEY: z.string().trim().default(""),
  MAIL_FROM: z.string().trim().default(""),
  MAIL_PROVIDER: z.enum(["resend", "smtp"]).optional(),
  SMTP_HOST: z.string().trim().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().trim().default(""),
  SMTP_PASS: z.string().trim().default(""),
  SMTP_FROM: z.string().trim().default(""),

  // --- Listing scraper fallback (optional) ---------------------------------
  // Reads a listing page through a third-party unblocking service when the
  // site refuses us directly. Unset means off, and the import degrades through
  // URL hints, a map lookup and the traveller's paste exactly as before.
  // The provider is described by these variables rather than in code, so
  // switching service never needs a deploy of ours — see
  // server/utils/scraper/providers.ts and docs/runbooks/secrets.md.
  /**
   * The same kill switch, and this one costs money per request. Turning the
   * rung off by deleting a paid key is a bad trade: you lose the credential to
   * pause the spend. Unset means on.
   */
  SCRAPER_ENABLED: z.string().trim().default(""),
  SCRAPER_PROVIDER: z.string().trim().default(""),
  SCRAPER_API_KEY: z.string().trim().default(""),
  SCRAPER_ENDPOINT: optionalUrl,
  SCRAPER_METHOD: z.enum(["GET", "POST"]).optional(),
  SCRAPER_URL_PARAM: z.string().trim().default(""),
  SCRAPER_API_KEY_PARAM: z.string().trim().default(""),
  SCRAPER_API_KEY_IN: z.enum(["query", "header", "body", "basic"]).optional(),
  /** What this vendor calls "run the page's JavaScript"; `none` if it has none. */
  SCRAPER_RENDER_PARAM: z.string().trim().default(""),
  /** `a=b&c=d`, or a JSON object when a value contains characters a query mangles. */
  SCRAPER_PARAMS: z.string().trim().default(""),
  SCRAPER_HTML_PATH: z.string().trim().default(""),
  SCRAPER_RENDER_JS: z.string().trim().default(""),
  SCRAPER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .max(120_000)
    .default(30_000),
  /** Comma-separated hosts to spend the quota on. Empty means every host. */
  SCRAPER_HOSTS: z.string().trim().default(""),
});

/**
 * This app runs on Postgres. Pointing a connection variable at anything else
 * (an old MySQL/TiDB URL, an HTTP endpoint) fails deep inside the driver as an
 * opaque "error establishing an SSL connection", so check the scheme up front.
 */
function isPostgresUrl(url: string) {
  return /^postgres(ql)?:\/\//i.test(url.trim());
}

/**
 * `DATABASE_URL` first, then the variables the Supabase/Vercel integration
 * manages, which are fallbacks and not necessarily good ones. Older versions of
 * that integration point every one of them — `POSTGRES_URL` included — at
 * Supabase's direct host, which publishes no A record; on a host without IPv6
 * egress (Vercel) they cannot connect at all. This deployment is one of those,
 * so `DATABASE_URL` is the only variable that actually works here and it must
 * stay set. See docs/adr/0012-session-pooler-for-the-database-url.md.
 *
 * A variable holding a non-Postgres URL is skipped rather than used, and the
 * reason is reported through `describeConfig()`.
 */
const DB_URL_KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
] as const;

function resolveDatabaseUrl(env: Record<(typeof DB_URL_KEYS)[number], string>) {
  const rejected: string[] = [];
  for (const key of DB_URL_KEYS) {
    const value = env[key];
    if (!value) continue;
    if (!isPostgresUrl(value)) {
      rejected.push(key);
      continue;
    }
    return { url: value, source: key as string, rejected };
  }
  return { url: "", source: "", rejected };
}

function fail(issues: string[]): never {
  throw new Error(
    `Invalid environment configuration for APP_ENV=${APP_ENV}:\n${issues.join("\n")}\n\n` +
      `Fix your secrets and retry. Local: copy .env.example to .env. ` +
      `Deployed: run 'doppler secrets' or check the Vercel project settings. ` +
      `See docs/runbooks/environments.md.`
  );
}

function parseEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    fail(
      result.error.issues.map(
        i => `  - ${i.path.join(".") || "(root)"} ${i.message}`
      )
    );
  }
  return result.data;
}

const parsed = parseEnv();
const database = resolveDatabaseUrl(parsed);

// Cross-field rule: a deployed environment needs a usable Postgres URL from
// *some* variable. Reported here rather than per-field so the message can name
// every variable that was tried.
if (IS_DEPLOYED && !database.url) {
  fail([
    database.rejected.length
      ? `  - ${database.rejected.join(", ")} is set but is not a Postgres connection string`
      : `  - no database connection string: set one of ${DB_URL_KEYS.join(", ")}`,
  ]);
}

const defaultLogLevel: LogLevel =
  APP_ENV === "test" ? "silent" : APP_ENV === "development" ? "debug" : "info";

/** Which unblocking service `SCRAPER_API_KEY` is assumed to belong to. */
export const DEFAULT_SCRAPER_PROVIDER = "scrapingowl";

/**
 * The model used when `AI_MODEL` is unset.
 *
 * Pinned rather than an alias like `gemini-flash-latest`: an alias moves under
 * a deployed app without a deploy, and silently changing which model answers is
 * the same class of surprise that retired `gemini-2.5-flash` out from under
 * this code. Pinning makes the move deliberate; `AI_MODEL` makes it cheap.
 * Verified against the project's own key on 2026-08-10.
 */
export const DEFAULT_AI_MODEL = "gemini-3.6-flash";

/**
 * An operator's "off", in the spellings operators use.
 *
 * Deliberately opt-out rather than opt-in: an unset or empty flag means on, so
 * adding one of these variables to an environment that does not have it cannot
 * silently switch a working feature off. Only an explicit, recognisable "no"
 * disables — and anything unrecognised (`maybe`, a typo) is treated as on for
 * the same reason.
 */
function isDisabled(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return false;
  return /^(0|false|no|off|disabled?)$/.test(value);
}

/** Resend's shared sender needs no domain verification but only delivers to the account owner. */
export const RESEND_SANDBOX_FROM = "onboarding@resend.dev";

/**
 * Validated configuration, grouped by concern.
 * Prefer this over `ENV` in new code.
 */
export const config = {
  appEnv: parsed.APP_ENV,
  isProduction: parsed.APP_ENV === "production",
  isDeployed: IS_DEPLOYED,
  isTest: parsed.APP_ENV === "test",
  port: parsed.PORT,
  publicBaseUrl: parsed.PUBLIC_BASE_URL,
  logLevel: parsed.LOG_LEVEL ?? defaultLogLevel,

  /** Published contact point. Empty when this deployment has not set one. */
  supportEmail: parsed.SUPPORT_EMAIL,

  auth: {
    appId: parsed.VITE_APP_ID,
    cookieSecret: parsed.JWT_SECRET,
    oAuthServerUrl: parsed.OAUTH_SERVER_URL,
    ownerOpenId: parsed.OWNER_OPEN_ID,
  },

  db: {
    url: database.url,
    /** Per-process connection cap; see `server/db.ts`. */
    poolMax: parsed.DB_POOL_MAX,
    /** Which variable the URL came from — worth logging, unlike the URL itself. */
    source: database.source,
    /** Variables that were set but ignored because they aren't Postgres URLs. */
    rejected: database.rejected,
    get isConfigured() {
      return database.url.length > 0;
    },
  },

  /**
   * The key is what makes AI work; the base URL is an override.
   *
   * `server/_core/llm.ts` talks to Gemini through `@google/genai`, which knows
   * Google's endpoint and only accepts `AI_INTEGRATIONS_GEMINI_BASE_URL` when
   * you are pointing it somewhere else — a proxy, or the legacy Forge gateway.
   * Requiring both meant a correctly-configured Gemini key was reported as
   * `ai: missing` on `/api/health` and refused by `accommodations.matchAll`
   * before any request was attempted.
   *
   * The Forge pair still wins when set, and Forge genuinely needs its URL:
   * `imageGeneration`, `voiceTranscription`, `dataApi` and `notification` all
   * call that gateway directly and check `apiUrl` for themselves.
   */
  ai: {
    apiUrl:
      parsed.BUILT_IN_FORGE_API_URL || parsed.AI_INTEGRATIONS_GEMINI_BASE_URL,
    apiKey:
      parsed.BUILT_IN_FORGE_API_KEY || parsed.AI_INTEGRATIONS_GEMINI_API_KEY,
    /** Which variable supplied the key — a name, never the value. */
    get keySource() {
      if (parsed.BUILT_IN_FORGE_API_KEY) return "BUILT_IN_FORGE_API_KEY";
      if (parsed.AI_INTEGRATIONS_GEMINI_API_KEY)
        return "AI_INTEGRATIONS_GEMINI_API_KEY";
      return "";
    },
    /** `AI_ENABLED=false` turns the features off without removing the key. */
    get enabled() {
      return !isDisabled(process.env.AI_ENABLED);
    },
    get model() {
      return process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
    },
    get hasKey() {
      return Boolean(
        parsed.BUILT_IN_FORGE_API_KEY || parsed.AI_INTEGRATIONS_GEMINI_API_KEY
      );
    },
    // Spelled out rather than `this.enabled && this.hasKey`: a getter that
    // reads `this` makes the whole `config` object's type circular, and every
    // consumer of `config.ai` degrades to `unknown`.
    get isConfigured() {
      return (
        !isDisabled(process.env.AI_ENABLED) &&
        Boolean(
          parsed.BUILT_IN_FORGE_API_KEY || parsed.AI_INTEGRATIONS_GEMINI_API_KEY
        )
      );
    },
  },

  /**
   * Scraper settings are read live, for the same reason the mail ones are: an
   * optional capability whose absence only degrades behaviour, and one whose
   * whole point is being re-pointed at another vendor without a code change.
   * Shapes are still validated at boot by the schema above.
   */
  scraper: {
    /** `SCRAPER_ENABLED=false` pauses the spend without losing the key. */
    get enabled() {
      return !isDisabled(process.env.SCRAPER_ENABLED);
    },
    /**
     * A key with no vendor named means the vendor this project is wired for —
     * unless `SCRAPER_ENDPOINT` already says where to send the request, which
     * describes a service completely without needing a name for it.
     *
     * Requiring both variables made the common setup — paste the key in and
     * expect it to work — fail silently as "that site blocked us", which is
     * the one failure mode this whole rung exists to remove.
     */
    get provider() {
      const explicit = process.env.SCRAPER_PROVIDER?.trim();
      if (explicit) return explicit;
      if (!process.env.SCRAPER_API_KEY?.trim()) return "";
      return process.env.SCRAPER_ENDPOINT?.trim()
        ? "custom"
        : DEFAULT_SCRAPER_PROVIDER;
    },
    get apiKey() {
      return process.env.SCRAPER_API_KEY?.trim() ?? "";
    },
    get endpoint() {
      return process.env.SCRAPER_ENDPOINT?.trim() ?? "";
    },
    get method() {
      return process.env.SCRAPER_METHOD?.trim() ?? "";
    },
    get urlParam() {
      return process.env.SCRAPER_URL_PARAM?.trim() ?? "";
    },
    get apiKeyParam() {
      return process.env.SCRAPER_API_KEY_PARAM?.trim() ?? "";
    },
    get apiKeyIn() {
      return process.env.SCRAPER_API_KEY_IN?.trim() ?? "";
    },
    get renderParam() {
      return process.env.SCRAPER_RENDER_PARAM?.trim() ?? "";
    },
    get params() {
      return process.env.SCRAPER_PARAMS?.trim() ?? "";
    },
    get htmlPath() {
      return process.env.SCRAPER_HTML_PATH?.trim() ?? "";
    },
    /** Rendering costs more and takes longer, but Airbnb is a JavaScript shell. */
    get renderJs() {
      const value = process.env.SCRAPER_RENDER_JS?.trim().toLowerCase();
      return value ? !/^(0|false|no|off)$/.test(value) : true;
    },
    get timeoutMs() {
      const value = Number.parseInt(process.env.SCRAPER_TIMEOUT_MS || "", 10);
      return Number.isFinite(value) && value > 0 ? value : 30_000;
    },
    get hosts() {
      return (process.env.SCRAPER_HOSTS ?? "")
        .split(",")
        .map(host =>
          host
            .trim()
            .toLowerCase()
            .replace(/^www\./, "")
        )
        .filter(Boolean);
    },
  },

  /**
   * Mail settings are read live rather than frozen at boot.
   *
   * Unlike the database URL or session secret — which must be right before the
   * process serves a request — email is an optional capability whose absence
   * only degrades behaviour. Reading it lazily lets the mailer tests vary
   * providers without reloading modules, and costs nothing at runtime. The
   * shapes are still validated at boot by the schema above; these getters only
   * re-read the values.
   */
  mail: {
    get resendApiKey() {
      return process.env.RESEND_API_KEY?.trim() ?? "";
    },
    /** Pins a provider when both are configured; otherwise Resend then SMTP. */
    get preferredProvider() {
      const value = process.env.MAIL_PROVIDER?.trim().toLowerCase();
      return value === "resend" || value === "smtp" ? value : undefined;
    },
    get from() {
      return (
        process.env.MAIL_FROM?.trim() ||
        process.env.SMTP_FROM?.trim() ||
        process.env.SMTP_USER?.trim() ||
        RESEND_SANDBOX_FROM
      );
    },
    smtp: {
      get host() {
        return process.env.SMTP_HOST?.trim() ?? "";
      },
      get port() {
        return Number.parseInt(process.env.SMTP_PORT || "587", 10);
      },
      get user() {
        return process.env.SMTP_USER?.trim() ?? "";
      },
      get pass() {
        return process.env.SMTP_PASS?.trim() ?? "";
      },
      get isConfigured() {
        return Boolean(this.host && this.user && this.pass);
      },
    },
  },
} as const;

/** True when some provider exists; when false, emails can only be logged, never delivered. */
export function isEmailConfigured() {
  return Boolean(config.mail.resendApiKey) || config.mail.smtp.isConfigured;
}

/**
 * True when mail can reach *any* recipient, not just the operator.
 *
 * Resend refuses to deliver to third parties while the sender is its shared
 * sandbox address, so a Resend key alone is not enough — `MAIL_FROM` must name
 * a verified domain. SMTP authenticates as a real mailbox, so it can always
 * reach anyone.
 *
 * The sign-in UI keys off this: offering passwordless sign-in that only works
 * for one address is worse than not offering it.
 */
export function canEmailAnyRecipient() {
  if (config.mail.smtp.isConfigured) return true;
  return (
    Boolean(config.mail.resendApiKey) &&
    config.mail.from !== RESEND_SANDBOX_FROM
  );
}

/**
 * Flat, legacy-shaped view of the config kept so existing imports keep working.
 * New code should import `config` instead.
 */
export const ENV = {
  appId: config.auth.appId,
  cookieSecret: config.auth.cookieSecret,
  databaseUrl: config.db.url,
  oAuthServerUrl: config.auth.oAuthServerUrl,
  ownerOpenId: config.auth.ownerOpenId,
  isProduction: config.isProduction,
  forgeApiUrl: config.ai.apiUrl,
  forgeApiKey: config.ai.apiKey,
};

/**
 * Which vendor the scraper settings actually resolve to, and why not when they
 * don't — the resolved name rather than the raw variable, so `/api/health`
 * answers "is my provider switch live?" instead of echoing what was typed.
 *
 * Never throws: a summary that can crash the health endpoint is worse than one
 * that reports the problem.
 */
function describeScraperConfig(): { scraper: string; scraperError?: string } {
  // "off" and "disabled" are different answers to different questions: one
  // says somebody turned this rung off, the other says nobody ever set it up.
  if (!config.scraper.enabled) return { scraper: "off" };
  if (!config.scraper.apiKey) return { scraper: "disabled" };
  try {
    const provider = resolveScraperProvider({
      provider: config.scraper.provider,
      apiKey: config.scraper.apiKey,
      endpoint: config.scraper.endpoint,
      method: config.scraper.method,
      urlParam: config.scraper.urlParam,
      apiKeyParam: config.scraper.apiKeyParam,
      apiKeyIn: config.scraper.apiKeyIn,
      renderParam: config.scraper.renderParam,
      params: config.scraper.params,
      htmlPath: config.scraper.htmlPath,
    });
    return { scraper: provider ? provider.name : "disabled" };
  } catch (err) {
    return {
      scraper: "misconfigured",
      scraperError: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Boot-time summary safe to log: shows which capabilities are wired up
 * without ever revealing a secret value.
 */
export function describeConfig() {
  return {
    appEnv: config.appEnv,
    port: config.port,
    logLevel: config.logLevel,
    database: config.db.isConfigured ? "configured" : "missing",
    /** Which variable supplied the connection string — a name, never the value. */
    databaseSource: config.db.source || null,
    /** The connection cap this instance runs with; the first thing to check on EMAXCONNSESSION. */
    databasePoolMax: config.db.poolMax,
    /** Variables set but ignored for not being Postgres URLs; a common misconfiguration. */
    databaseIgnored: config.db.rejected.length ? config.db.rejected : undefined,
    // Same three-way distinction as the scraper: switched off on purpose,
    // never set up, or working.
    ai: !config.ai.enabled
      ? "off"
      : config.ai.hasKey
        ? "configured"
        : "missing",
    /** Which variable supplied the AI key — a name, never the value. */
    aiKeySource: config.ai.keySource || null,
    /** Which model requests go to. Not a secret, and the first thing to check
        when every AI call starts failing at once. */
    aiModel: config.ai.model,
    /**
     * Whether a published contact address exists — the name of the state, never
     * the address. An app-store submission needs this "configured": Apple's
     * guideline 1.2 requires published contact info for a UGC app.
     */
    supportEmail: config.supportEmail ? "configured" : "missing",
    // Three states, because "can send" and "can send to anyone" differ: Resend's
    // sandbox sender only reaches the account owner.
    email: !isEmailConfigured()
      ? "log-only"
      : canEmailAnyRecipient()
        ? "configured"
        : "owner-only",
    oauth: config.auth.oAuthServerUrl ? "configured" : "disabled",
    // The service's name, never its key — which vendor is in the path is
    // exactly what you want to see when an import starts behaving differently.
    // "misconfigured" is its own state: a key that is set but unusable is not
    // the same as a rung that was deliberately left off.
    ...describeScraperConfig(),
    sessionSecret: config.auth.cookieSecret ? "configured" : "missing",
  };
}
