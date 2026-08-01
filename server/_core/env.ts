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
  DATABASE_URL: IS_DEPLOYED
    ? z.string().min(1, "is required in a deployed environment")
    : z.string().default(""),

  // --- AI provider --------------------------------------------------------
  BUILT_IN_FORGE_API_URL: optionalUrl,
  BUILT_IN_FORGE_API_KEY: z.string().trim().default(""),
  AI_INTEGRATIONS_GEMINI_BASE_URL: optionalUrl,
  AI_INTEGRATIONS_GEMINI_API_KEY: z.string().trim().default(""),

  // --- Email --------------------------------------------------------------
  SMTP_HOST: z.string().trim().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().trim().default(""),
  SMTP_PASS: z.string().trim().default(""),
  SMTP_FROM: z.string().trim().default(""),
});

function parseEnv() {
  const result = schema.safeParse(process.env);
  if (result.success) return result.data;

  const issues = result.error.issues
    .map(i => `  - ${i.path.join(".") || "(root)"} ${i.message}`)
    .join("\n");
  throw new Error(
    `Invalid environment configuration for APP_ENV=${APP_ENV}:\n${issues}\n\n` +
      `Fix your secrets and retry. Local: copy .env.example to .env. ` +
      `Deployed: run 'doppler secrets' or check the Vercel project settings. ` +
      `See docs/runbooks/environments.md.`
  );
}

const parsed = parseEnv();

const defaultLogLevel: LogLevel =
  APP_ENV === "test" ? "silent" : APP_ENV === "development" ? "debug" : "info";

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
    url: parsed.DATABASE_URL,
    get isConfigured() {
      return parsed.DATABASE_URL.length > 0;
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

  smtp: {
    host: parsed.SMTP_HOST,
    port: parsed.SMTP_PORT,
    user: parsed.SMTP_USER,
    pass: parsed.SMTP_PASS,
    from: parsed.SMTP_FROM || parsed.SMTP_USER,
    get isConfigured() {
      return Boolean(parsed.SMTP_HOST && parsed.SMTP_USER && parsed.SMTP_PASS);
    },
  },
} as const;

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
    ai: config.ai.isConfigured ? "configured" : "missing",
    smtp: config.smtp.isConfigured ? "configured" : "console-fallback",
    oauth: config.auth.oAuthServerUrl ? "configured" : "disabled",
    sessionSecret: config.auth.cookieSecret ? "configured" : "missing",
  };
}
