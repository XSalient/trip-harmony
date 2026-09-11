/**
 * Two conveniences that must never be reachable on a public deployment.
 *
 * `APP_ENV` wins over `VERCEL_ENV` in `resolveAppEnv`, by design — a deployment
 * can deliberately be run in another mode. The cost showed up on wevotrip.com,
 * where `APP_ENV=development` was set on the Vercel project and `/api/health`
 * duly reported `appEnv: "development"` from the live site. Every
 * `!config.isProduction` and `!config.isDeployed` check answered "we're in
 * development" in production.
 *
 * Most of what that changed was noise — debug-level logs, pretty-printed
 * console output instead of JSON. Two were not:
 *
 * 1. `auth.requestMagicLink` returned `debugUrl`, a working 15-minute sign-in
 *    link. The procedure is public and takes any address, so that is an
 *    unauthenticated caller being handed a session for an account they have
 *    proved nothing about.
 * 2. `clientSafeMessage` returned null, so the raw wrapped cause — pg error
 *    text included — went to the browser instead of a reference id.
 *
 * Both now also ask `config.onDeployedPlatform`, which reads `VERCEL` and which
 * no value of `APP_ENV` can switch off. This test pins the shape of that
 * condition rather than the behaviour, because reproducing it would mean
 * re-importing `env.ts` under a mutated `process.env` — the module reads it
 * once at import, which is the property that makes it trustworthy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "./_core/env.js";

const read = (relative: string) =>
  readFileSync(join(import.meta.dirname, relative), "utf8");

describe("the platform signal", () => {
  it("is derived from the platform, not from APP_ENV", () => {
    const src = read("./_core/env.ts");
    expect(src).toContain(
      "const ON_DEPLOYED_PLATFORM = Boolean(process.env.VERCEL)"
    );
    expect(src).toContain("onDeployedPlatform: ON_DEPLOYED_PLATFORM");
  });

  it("is false under the test runner, which is not deployed", () => {
    expect(config.onDeployedPlatform).toBe(false);
  });

  /**
   * The boot-time secret rules are a separate decision. Widening IS_DEPLOYED to
   * include the platform would start enforcing them on a deployment that is
   * already running, and those rules `throw` — which takes the whole API down
   * rather than degrading it.
   */
  it("does not silently widen the boot-time validation", () => {
    const src = read("./_core/env.ts");
    const isDeployed = src.match(/const IS_DEPLOYED = .*/)?.[0] ?? "";
    expect(isDeployed).not.toContain("ON_DEPLOYED_PLATFORM");
  });
});

describe("the magic link never comes back in the response", () => {
  const src = read("./routers/auth.ts");

  it("withholds debugUrl on a deployed platform whatever APP_ENV says", () => {
    expect(src).toContain(
      "const isDev = !config.isProduction && !config.onDeployedPlatform;"
    );
  });

  it("is the only thing that decides whether debugUrl is returned", () => {
    // If a second path starts returning the URL, this test should be the thing
    // that notices — so pin that `isDev` remains the only gate on it.
    const returns = [...src.matchAll(/debugUrl/g)];
    expect(returns.length, "debugUrl appears more than where it is gated").toBe(
      1
    );
    expect(src).toContain("...(isDev ? { debugUrl: magicUrl } : {})");
  });
});

describe("internal error text never reaches the browser", () => {
  it("produces the safe message on a deployed platform too", () => {
    const src = read("./_core/trpcErrors.ts");
    expect(src).toContain(
      "if (!config.isDeployed && !config.onDeployedPlatform) return null;"
    );
  });
});
