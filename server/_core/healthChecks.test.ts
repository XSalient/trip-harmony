/**
 * These tests are about one thing: the report must never claim a dependency is
 * healthy on the strength of a variable being set. Every case below is a state
 * where `describeConfig()` says "configured" and the truth is otherwise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "../routers/index.js";
import type { TrpcContext } from "./context.js";
import { probeEmail } from "../utils/mailer.js";

const MAIL_ENV = [
  "RESEND_API_KEY",
  "MAIL_FROM",
  "MAIL_PROVIDER",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
];

function domainsResponse(domains: Array<{ name: string; status: string }>) {
  return new Response(JSON.stringify({ data: domains }), { status: 200 });
}

describe("email probe", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(MAIL_ENV.map(k => [k, process.env[k]]));
    for (const k of MAIL_ENV) delete process.env[k];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.restoreAllMocks();
  });

  it("calls an unreachable provider broken, and names the errno", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "WeVoTrip <hello@wevotrip.com>";
    // The invite outage exactly: no response at all, errno buried on `cause`.
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("fetch failed", {
        cause: Object.assign(new Error("connect ECONNREFUSED"), {
          code: "ECONNREFUSED",
        }),
      })
    );

    const probe = await probeEmail();

    expect(probe.verdict).toBe("broken");
    expect(probe.detail).toContain("ECONNREFUSED");
  });

  it("calls an unverified sender domain broken, not configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "WeVoTrip <hello@wevotrip.com>";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      domainsResponse([{ name: "wevotrip.com", status: "pending" }])
    );

    const probe = await probeEmail();

    expect(probe.verdict).toBe("broken");
    expect(probe.summary).toContain("not verified");
    // This is the gap `canEmailAnyRecipient()` cannot see: MAIL_FROM is not the
    // sandbox sender, so the cheap check would call this configured.
    expect(probe.facts.domainStatus).toBe("pending");
  });

  it("calls a sender domain that is not in the account at all broken", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "hello@typo-domain.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      domainsResponse([{ name: "wevotrip.com", status: "verified" }])
    );

    const probe = await probeEmail();

    expect(probe.verdict).toBe("broken");
    expect(probe.summary).toContain("not a domain in this Resend account");
  });

  it("passes a reachable provider with a verified domain", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "WeVoTrip <hello@wevotrip.com>";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      domainsResponse([{ name: "wevotrip.com", status: "verified" }])
    );

    const probe = await probeEmail();

    expect(probe.verdict).toBe("ok");
  });

  it("reports a bad key as broken", async () => {
    process.env.RESEND_API_KEY = "re_wrong";
    process.env.MAIL_FROM = "hello@wevotrip.com";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 401 })
    );

    const probe = await probeEmail();

    expect(probe.verdict).toBe("broken");
    expect(probe.summary).toContain("rejected the API key");
  });

  it("does not condemn a send-only key it cannot check with", async () => {
    process.env.RESEND_API_KEY = "re_sending_only";
    process.env.MAIL_FROM = "hello@wevotrip.com";
    // A restricted key can send but cannot list domains. Calling that broken
    // would send somebody to rotate a key that works.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 403 })
    );

    const probe = await probeEmail();

    expect(probe.verdict).toBe("unknown");
    expect(probe.detail).toContain("sending-only");
  });

  it("reports no provider at all as broken", async () => {
    const probe = await probeEmail();

    expect(probe.provider).toBe("none");
    expect(probe.verdict).toBe("broken");
  });

  it("probes the provider a send would actually use, not a fallback", async () => {
    // Both configured: Resend goes first, so SMTP's health is not the answer.
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "hello@wevotrip.com";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "sender@example.com";
    process.env.SMTP_PASS = "app-password";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      domainsResponse([{ name: "wevotrip.com", status: "verified" }])
    );

    const probe = await probeEmail();

    expect(probe.provider).toBe("resend");
  });
});

/**
 * The gate is the feature here as much as the checks are. The report names
 * every secret that is set, which model is in use and where the session secret
 * is weak, and running it makes an outbound request per dependency — so an
 * unauthenticated version would be both a map and an amplifier.
 */
describe("diagnostics is admin-only", () => {
  function contextFor(role: "user" | "admin" | null): TrpcContext {
    const base = {
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    if (role === null) return { ...base, user: null };
    return {
      ...base,
      user: {
        id: 1,
        openId: "test-user-1",
        email: "test1@example.com",
        name: "Test User",
        loginMethod: "manus",
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      } as NonNullable<TrpcContext["user"]>,
    };
  }

  it("refuses an anonymous caller", async () => {
    const caller = appRouter.createCaller(contextFor(null));
    await expect(caller.system.diagnostics()).rejects.toThrow();
  });

  it("refuses a signed-in non-admin", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.system.diagnostics()).rejects.toThrow();
  });

  it("refuses before running a single check", async () => {
    // Not merely "the response is a 403": the checks must not run at all, or
    // an anonymous caller could still spend the deployment's rate limits by
    // asking repeatedly and discarding the error.
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const caller = appRouter.createCaller(contextFor("user"));

    await expect(caller.system.diagnostics()).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
