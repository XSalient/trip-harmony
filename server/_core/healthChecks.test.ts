/**
 * These tests are about one thing: the report must never claim a dependency is
 * healthy on the strength of a variable being set. Every case below is a state
 * where `describeConfig()` says "configured" and the truth is otherwise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { appRouter } from "../routers/index.js";
import type { TrpcContext } from "./context.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resetHealthTestCooldowns } from "./healthTests.js";
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

/**
 * The test endpoint does real work, so the questions worth asking of it are
 * about blast radius, not correctness of output.
 */
describe("service tests are admin-only and narrowly aimed", () => {
  beforeEach(() => resetHealthTestCooldowns());

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
        email: "admin@example.com",
        name: "Test Admin",
        loginMethod: "manus",
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      } as NonNullable<TrpcContext["user"]>,
    };
  }

  it("refuses a non-admin before sending anything", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const caller = appRouter.createCaller(contextFor("user"));

    await expect(
      caller.system.testService({ service: "email" })
    ).rejects.toThrow();

    // The point is not the 403 — it is that no email left the building on the
    // way to it.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    const caller = appRouter.createCaller(contextFor(null));
    await expect(
      caller.system.testService({ service: "ai" })
    ).rejects.toThrow();
  });

  it("sends the test email only to the caller's own address", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "WeVoTrip <hello@wevotrip.com>";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    const caller = appRouter.createCaller(contextFor("admin"));
    const result = await caller.system.testService({ service: "email" });

    expect(result.passed).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // There is no input that could have made this any other address; this
    // asserts the wiring actually honours that.
    expect(JSON.parse(init.body as string).to).toEqual(["admin@example.com"]);
  });

  it("refuses an input carrying a destination", () => {
    // Zod strips unknown keys by default, so without `.strict()` this would
    // have been accepted and silently ignored — safe today, and exactly the
    // shape that stops being safe the moment somebody wires the input through.
    // Refusing it outright is what keeps this from being a relay with a login.
    const caller = appRouter.createCaller(contextFor("admin"));
    return expect(
      caller.system.testService({
        service: "email",
        to: "somebody-else@example.com",
      } as never)
    ).rejects.toThrow();
  });
});

/**
 * "Admin" means two unrelated things in this codebase, and both enums spell it
 * the same way:
 *
 *   users.role         → user_role   ["user", "admin"]        — the operator
 *   trip_members.role  → member_role ["watcher", "tripmate", "admin"] — a trip
 *
 * The health surface is the operator's. A trip admin is an ordinary customer
 * who organises a holiday: they must never see which secrets this deployment
 * has, which model it calls, how weak its session secret is, or be able to
 * spend its Resend and Google quota. `adminProcedure` reads `users.role` and is
 * correct today — this pins it, because the mistake is a one-word edit away and
 * nothing else in the suite would notice it.
 */
describe("the health surface is for the system admin, not a trip admin", () => {
  beforeEach(() => resetHealthTestCooldowns());

  /** Organises trips, admin on every one of them. Not an operator. */
  function tripAdminContext(): TrpcContext {
    return {
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
      user: {
        id: 7,
        openId: "trip-admin-7",
        email: "organiser@example.com",
        name: "Trip Organiser",
        loginMethod: "manus",
        // `users.role`. Their `trip_members.role` is "admin" on their own
        // trips, which is a different column and confers nothing here.
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      } as NonNullable<TrpcContext["user"]>,
    };
  }

  it("does not let a trip admin read the diagnostics", async () => {
    const caller = appRouter.createCaller(tripAdminContext());
    await expect(caller.system.diagnostics()).rejects.toThrow();
  });

  it("does not let a trip admin spend the deployment's quota", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const caller = appRouter.createCaller(tripAdminContext());

    await expect(
      caller.system.testService({ service: "email" })
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gates on users.role, not on any trip membership", () => {
    // Pinning the shape as well as the behaviour: a future `adminProcedure`
    // that consulted a membership would still pass the two tests above for a
    // caller with no trips, and fail in production for one with a trip.
    const src = readFileSync(join(import.meta.dirname, "./trpc.ts"), "utf8");
    expect(src).toContain('ctx.user.role !== "admin"');
    expect(src).not.toContain("requireTripRole");
  });
});
