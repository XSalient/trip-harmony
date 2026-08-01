import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEmailConfigured, sendMagicLinkEmail } from "./mailer";

const MAIL_ENV = ["RESEND_API_KEY", "MAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];

describe("mailer delivery reporting", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(MAIL_ENV.map((k) => [k, process.env[k]]));
    for (const k of MAIL_ENV) delete process.env[k];
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.restoreAllMocks();
  });

  it("reports no provider as undelivered instead of silently succeeding", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isEmailConfigured()).toBe(false);

    const result = await sendMagicLinkEmail("traveler@example.com", "https://example.com/auth/magic/abc");

    expect(result.delivered).toBe(false);
    expect(result.error).toMatch(/no email provider/i);
  });

  it("delivers through the Resend HTTP API when a key is set", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "Harmony <hello@example.com>";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(isEmailConfigured()).toBe(true);
    const result = await sendMagicLinkEmail("traveler@example.com", "https://example.com/auth/magic/abc");

    expect(result.delivered).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("Harmony <hello@example.com>");
    expect(body.to).toEqual(["traveler@example.com"]);
    expect(body.text).toContain("https://example.com/auth/magic/abc");
  });

  it("reports a provider failure as undelivered", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("domain not verified", { status: 403 }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendMagicLinkEmail("traveler@example.com", "https://example.com/auth/magic/abc");

    expect(result.delivered).toBe(false);
    expect(result.error).toContain("403");
  });
});
