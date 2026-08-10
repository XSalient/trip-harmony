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

  // --- AI provider --------------------------------------------------------
  BUILT_IN_FORGE_API_URL: optionalUrl,
  BUILT_IN_FORGE_API_KEY: z.string().trim().default(""),
  AI_INTEGRATIONS_GEMINI_BASE_URL: optionalUrl,
  AI_INTEGRATIONS_GEMINI_API_KEY: z.string().trim().default(""),

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
  SCRAPER_PROVIDER: z.string().trim().default(""),
  SCRAPER_API_KEY: z.string().trim().default(""),
  SCRAPER_ENDPOINT: optionalUrl,
  SCRAPER_METHOD: z.enum(["GET", "POST"]).optional(),
  SCRAPER_URL_PARAM: z.string().trim().default(""),
  SCRAPER_API_KEY_PARAM: z.string().trim().default(""),
  SCRAPER_API_KEY_IN: z.enum(["query", "header", "body"]).optional(),
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

  auth: {
    appId: parsed.VITE_APP_ID,
    cookieSecret: parsed.JWT_SECRET,
    oAuthServerUrl: parsed.OAUTH_SERVER_URL,
    ownerOpenId: parsed.OWNER_OPEN_ID,
  },

  db: {
    url: database.url,
    /** Which variable the URL came from — worth logging, unlike the URL itself. */
    source: database.source,
    /** Variables that were set but ignored because they aren't Postgres URLs. */
    rejected: database.rejected,
    get isConfigured() {
      return database.url.length > 0;
    },
  },

  ai: {
    apiUrl:
      parsed.BUILT_IN_FORGE_API_URL || parsed.AI_INTEGRATIONS_GEMINI_BASE_URL,
    apiKey:
      parsed.BUILT_IN_FORGE_API_KEY || parsed.AI_INTEGRATIONS_GEMINI_API_KEY,
    get isConfigured() {
      return Boolean(
        (parsed.BUILT_IN_FORGE_API_URL ||
          parsed.AI_INTEGRATIONS_GEMINI_BASE_URL) &&
          (parsed.BUILT_IN_FORGE_API_KEY ||
            parsed.AI_INTEGRATIONS_GEMINI_API_KEY)
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
    /**
     * A key with no vendor named means the vendor this project is wired for.
     * Requiring both variables made the common setup — paste the key in and
     * expect it to work — fail silently as "that site blocked us", which is
     * the one failure mode this whole rung exists to remove.
     */
    get provider() {
      const explicit = process.env.SCRAPER_PROVIDER?.trim();
      if (explicit) return explicit;
      return process.env.SCRAPER_API_KEY?.trim()
        ? DEFAULT_SCRAPER_PROVIDER
        : "";
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
    /** Variables set but ignored for not being Postgres URLs; a common misconfiguration. */
    databaseIgnored: config.db.rejected.length ? config.db.rejected : undefined,
    ai: config.ai.isConfigured ? "configured" : "missing",
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
    scraper:
      config.scraper.provider && config.scraper.apiKey
        ? config.scraper.provider
        : "disabled",
    sessionSecret: config.auth.cookieSecret ? "configured" : "missing",
  };
}
