/**
 * Structured logging.
 *
 * - Deployed (Vercel): one JSON object per line on stdout/stderr, which Vercel
 *   indexes and exposes in runtime logs. No file writes — the filesystem is
 *   ephemeral and read-only outside /tmp.
 * - Local development: human-readable lines on the console *and* a JSONL copy
 *   under `logs/` so an AI agent or developer can grep a failing run after the
 *   fact instead of re-reproducing it.
 *
 * Secrets are redacted centrally (see `SECRET_ENV_KEYS` and `REDACT_KEYS`), so
 * logging a whole request or config object never leaks credentials.
 *
 * See docs/runbooks/logging.md.
 */
import fs from "node:fs";
import path from "node:path";
import { config, type LogLevel } from "./env";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/** Object keys whose values are replaced with `[redacted]` anywhere in a log payload. */
const REDACT_KEYS = new Set(
  [
    "password",
    "passwordhash",
    "passwordconfirm",
    "token",
    "accesstoken",
    "refreshtoken",
    "sessiontoken",
    "authorization",
    "cookie",
    "secret",
    "apikey",
    "api_key",
    "jwt_secret",
    "database_url",
    "smtp_pass",
    "doppler_token",
  ].map(k => k.toLowerCase())
);

const REDACTED = "[redacted]";
const MAX_DEPTH = 6;

/** Recursively strip secret-looking values so callers can log objects freely. */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACT_KEYS.has(key.toLowerCase())
        ? REDACTED
        : redact(val, depth + 1);
    }
    return out;
  }
  return value;
}

export type LogFields = Record<string, unknown>;

type Entry = {
  time: string;
  level: Exclude<LogLevel, "silent">;
  env: string;
  msg: string;
} & LogFields;

const threshold = LEVEL_ORDER[config.logLevel];

// --- File sink (local development only) ------------------------------------

const LOG_DIR = path.resolve(process.cwd(), "logs");
let fileStream: fs.WriteStream | null = null;
let fileSinkDisabled = config.isDeployed || config.isTest;

function writeToFile(line: string) {
  if (fileSinkDisabled) return;
  try {
    if (!fileStream) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      fileStream = fs.createWriteStream(
        path.join(LOG_DIR, `${config.appEnv}-${day}.jsonl`),
        {
          flags: "a",
        }
      );
      fileStream.on("error", () => {
        fileSinkDisabled = true;
      });
    }
    fileStream.write(`${line}\n`);
  } catch {
    // Never let logging break the request path.
    fileSinkDisabled = true;
  }
}

// --- Formatting -------------------------------------------------------------

const CONSOLE_COLOR: Record<string, string> = {
  debug: "\x1b[90m",
  info: "\x1b[36m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

function formatForConsole(entry: Entry): string {
  const { time, level, msg, env: _env, ...rest } = entry;
  const color = CONSOLE_COLOR[level] ?? "";
  const reset = color ? "\x1b[0m" : "";
  const detail = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
  return `${color}${time.slice(11, 23)} ${level.toUpperCase().padEnd(5)}${reset} ${msg}${detail}`;
}

function emit(
  level: Exclude<LogLevel, "silent">,
  bindings: LogFields,
  msg: string,
  fields?: LogFields
) {
  if (LEVEL_ORDER[level] < threshold) return;

  const entry = {
    time: new Date().toISOString(),
    level,
    env: config.appEnv,
    msg,
    ...(redact(bindings) as LogFields),
    ...(redact(fields ?? {}) as LogFields),
  } as Entry;

  const json = JSON.stringify(entry);
  const sink =
    level === "error" || level === "warn" ? console.error : console.log;

  if (config.isDeployed) {
    sink(json);
  } else {
    sink(formatForConsole(entry));
    writeToFile(json);
  }
}

export type Logger = {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** Derive a logger that stamps every entry with extra fields (e.g. requestId). */
  child(bindings: LogFields): Logger;
};

function createLogger(bindings: LogFields = {}): Logger {
  return {
    debug: (msg, fields) => emit("debug", bindings, msg, fields),
    info: (msg, fields) => emit("info", bindings, msg, fields),
    warn: (msg, fields) => emit("warn", bindings, msg, fields),
    error: (msg, fields) => emit("error", bindings, msg, fields),
    child: extra => createLogger({ ...bindings, ...extra }),
  };
}

/** Root logger. Prefer `logger.child({ scope: "..." })` inside a module. */
export const logger = createLogger();
