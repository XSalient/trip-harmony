import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, describeConfig } from "./env.js";

/**
 * `env.ts` freezes the parsed schema at import, so anything that varies with
 * the environment has to be re-imported under it rather than poked at.
 */
async function configWith(vars: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
  return import("./env.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("config", () => {
  it("resolves to the test environment under vitest", () => {
    expect(config.appEnv).toBe("test");
    expect(config.isTest).toBe(true);
    expect(config.isDeployed).toBe(false);
    expect(config.isProduction).toBe(false);
  });

  it("silences logging by default so test output stays readable", () => {
    expect(config.logLevel).toBe("silent");
  });

  it("does not load local .env files, so tests cannot reach a developer's database", () => {
    // env.ts skips dotenv entirely when VITEST is set.
    expect(process.env.VITEST).toBeTruthy();
    expect(config.db.isConfigured).toBe(false);
  });
});

describe("describeConfig", () => {
  it("reports capability status without revealing any value", () => {
    const summary = describeConfig();
    expect(summary.appEnv).toBe("test");
    expect(Object.values(summary)).not.toContain(
      config.auth.cookieSecret || "\u0000 never a real secret"
    );

    // Every field is a coarse status string or a plain scalar — never a secret.
    expect(summary.database).toMatch(/^(configured|missing)$/);
    expect(summary.ai).toMatch(/^(configured|missing)$/);
    // Three states: no provider, a provider that can only reach the operator
    // (Resend's sandbox sender), and one that can reach anyone.
    expect(summary.email).toMatch(/^(log-only|owner-only|configured)$/);
    expect(summary.sessionSecret).toMatch(/^(configured|missing)$/);
  });

  it("names the variable a connection string came from, never the string", () => {
    const summary = describeConfig();
    // Unset in tests, so there is no source to report.
    expect(summary.databaseSource).toBeNull();
    expect(JSON.stringify(summary)).not.toMatch(/postgres(ql)?:\/\//);
  });
});

/**
 * Production reported `ai: missing` for a day with a valid Gemini key set,
 * because this flag also demanded a base URL. `@google/genai` knows Google's
 * endpoint; the base URL is an override for a proxy or the legacy Forge
 * gateway. The cost was not cosmetic — `accommodations.fetchFromUrl` reads the
 * same flag and refused every URL import before attempting one.
 */
describe("AI is configured by its key", () => {
  it("counts a Gemini key on its own as configured", async () => {
    const { config, describeConfig } = await configWith({
      AI_INTEGRATIONS_GEMINI_API_KEY: "gemini-key",
    });
    expect(config.ai.isConfigured).toBe(true);
    expect(config.ai.apiKey).toBe("gemini-key");
    const summary = describeConfig();
    expect(summary.ai).toBe("configured");
    expect(summary.aiKeySource).toBe("AI_INTEGRATIONS_GEMINI_API_KEY");
    expect(JSON.stringify(summary)).not.toContain("gemini-key");
  });

  it("still lets the legacy Forge pair win when both are set", async () => {
    const { config, describeConfig } = await configWith({
      AI_INTEGRATIONS_GEMINI_API_KEY: "gemini-key",
      BUILT_IN_FORGE_API_KEY: "forge-key",
      BUILT_IN_FORGE_API_URL: "https://forge.example.test",
    });
    expect(config.ai.apiKey).toBe("forge-key");
    expect(config.ai.apiUrl).toBe("https://forge.example.test");
    expect(describeConfig().aiKeySource).toBe("BUILT_IN_FORGE_API_KEY");
  });

  it("is missing with no key at all", async () => {
    const { config } = await configWith({});
    expect(config.ai.isConfigured).toBe(false);
  });
});

/**
 * `gemini-2.5-flash` was hardcoded in `llm.ts` and stopped accepting new
 * callers, so every AI request 404'd while `/api/health` still said
 * `ai: configured` — the key was fine, the model was gone. Models are retired
 * on the vendor's schedule, so which one to call is configuration.
 */
describe("AI_MODEL", () => {
  it("defaults to a model verified against a real key", async () => {
    const { config, describeConfig } = await configWith({
      AI_INTEGRATIONS_GEMINI_API_KEY: "k",
    });
    expect(config.ai.model).toBe("gemini-3.6-flash");
    expect(describeConfig().aiModel).toBe("gemini-3.6-flash");
  });

  it("takes whichever model the environment names", async () => {
    const { config } = await configWith({
      AI_INTEGRATIONS_GEMINI_API_KEY: "k",
      AI_MODEL: "gemini-3.1-flash-lite",
    });
    expect(config.ai.model).toBe("gemini-3.1-flash-lite");
  });

  it("is what llm.ts actually calls, rather than a constant beside it", () => {
    const src = readFileSync(new URL("./llm.ts", import.meta.url), "utf8");
    // `appConfig`, not `config`: the local request object in `invokeLLM` is
    // also called `config`, and shadowing it once cost a build.
    expect(src).toMatch(/const model = appConfig\.ai\.model;/);
    expect(src).not.toMatch(/model:\s*"gemini/);
  });
});

/**
 * A kill switch that is independent of the credential. Removing a key to pause
 * a feature conflates "stop calling this" with "rotate this secret", and the
 * scraper's key is one you pay for — losing it to pause the spend is a bad
 * trade. Unset means on, so adding these variables to an environment that
 * lacks them can never switch a working feature off by surprise.
 */
describe("AI_ENABLED and SCRAPER_ENABLED", () => {
  it("keeps a feature on when the flag is absent or empty", async () => {
    const { config } = await configWith({
      AI_INTEGRATIONS_GEMINI_API_KEY: "k",
      SCRAPER_API_KEY: "k",
      AI_ENABLED: "",
      SCRAPER_ENABLED: "",
    });
    expect(config.ai.isConfigured).toBe(true);
    expect(config.scraper.enabled).toBe(true);
  });

  it("switches AI off while the key stays in place", async () => {
    const { config, describeConfig } = await configWith({
      AI_INTEGRATIONS_GEMINI_API_KEY: "gemini-key",
      AI_ENABLED: "false",
    });
    expect(config.ai.isConfigured).toBe(false);
    // The key is still there — that is the whole point of the flag.
    expect(config.ai.hasKey).toBe(true);
    expect(describeConfig().ai).toBe("off");
  });

  it("switches the scraper off while the key stays in place", async () => {
    const { config, describeConfig } = await configWith({
      SCRAPER_API_KEY: "scraper-key",
      SCRAPER_PROVIDER: "scraperapi",
      SCRAPER_ENABLED: "false",
    });
    expect(config.scraper.enabled).toBe(false);
    expect(config.scraper.apiKey).toBe("scraper-key");
    // "off" and "disabled" answer different questions: turned off on purpose,
    // versus never set up at all.
    expect(describeConfig().scraper).toBe("off");
  });

  it("accepts the spellings operators write 'off' with", async () => {
    for (const value of ["0", "false", "FALSE", "no", "off", "disabled"]) {
      const { config } = await configWith({
        SCRAPER_API_KEY: "k",
        SCRAPER_ENABLED: value,
      });
      expect(config.scraper.enabled, value).toBe(false);
    }
  });

  it("treats anything it does not recognise as on", async () => {
    // A typo must not silently disable a paid feature.
    for (const value of ["true", "yes", "1", "enabled", "maybe", "flase"]) {
      const { config } = await configWith({
        SCRAPER_API_KEY: "k",
        SCRAPER_ENABLED: value,
      });
      expect(config.scraper.enabled, value).toBe(true);
    }
  });
});

/**
 * Switching unblocking vendor is meant to be an environment edit. What the
 * health summary reports is therefore the vendor the settings *resolve to*,
 * not the string somebody typed — and "the key is set but unusable" is its own
 * state, distinct from "this rung was deliberately left off".
 */
describe("the scraper reports the vendor it resolves to", () => {
  it("resolves a vendor's domain to the vendor", async () => {
    const { describeConfig } = await configWith({
      SCRAPER_API_KEY: "scraper-key",
      SCRAPER_PROVIDER: "scraperapi.com",
    });
    const summary = describeConfig();
    expect(summary.scraper).toBe("scraperapi");
    expect(JSON.stringify(summary)).not.toContain("scraper-key");
  });

  it("says misconfigured, not disabled, when a key is set but unusable", async () => {
    const { describeConfig } = await configWith({
      SCRAPER_API_KEY: "scraper-key",
      SCRAPER_PROVIDER: "no-such-vendor",
    });
    const summary = describeConfig();
    expect(summary.scraper).toBe("misconfigured");
    expect(summary.scraperError).toMatch(/SCRAPER_PROVIDER/);
  });

  it("is disabled when no key is set, whatever the provider says", async () => {
    const { describeConfig } = await configWith({
      SCRAPER_PROVIDER: "scraperapi",
    });
    expect(describeConfig().scraper).toBe("disabled");
  });
});
