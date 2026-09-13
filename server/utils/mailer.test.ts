import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nodemailer from "nodemailer";
import {
  canEmailAnyRecipient,
  isEmailConfigured,
  sendMagicLinkEmail,
} from "./mailer.js";

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

describe("mailer delivery reporting", () => {
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

  it("reports no provider as undelivered instead of silently succeeding", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isEmailConfigured()).toBe(false);

    const result = await sendMagicLinkEmail(
      "traveler@example.com",
      "https://example.com/auth/magic/abc"
    );

    expect(result.delivered).toBe(false);
    expect(result.error).toMatch(/no email provider/i);
  });

  it("delivers through the Resend HTTP API when a key is set", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "WeVoTrip <hello@example.com>";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(isEmailConfigured()).toBe(true);
    const result = await sendMagicLinkEmail(
      "traveler@example.com",
      "https://example.com/auth/magic/abc"
    );

    expect(result.delivered).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("WeVoTrip <hello@example.com>");
    expect(body.to).toEqual(["traveler@example.com"]);
    expect(body.text).toContain("https://example.com/auth/magic/abc");
  });

  it("reports a provider failure as undelivered", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("domain not verified", { status: 403 })
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendMagicLinkEmail(
      "traveler@example.com",
      "https://example.com/auth/magic/abc"
    );

    expect(result.delivered).toBe(false);
    expect(result.error).toContain("403");
  });

  it("distinguishes a rejected send from a missing provider", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        '{"message":"You can only send testing emails to your own email address"}',
        { status: 403 }
      )
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const rejected = await sendMagicLinkEmail(
      "someone-else@example.com",
      "https://example.com/auth/magic/abc"
    );
    expect(rejected.reason).toBe("provider_rejected");

    delete process.env.RESEND_API_KEY;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const unconfigured = await sendMagicLinkEmail(
      "someone-else@example.com",
      "https://example.com/auth/magic/abc"
    );
    expect(unconfigured.reason).toBe("not_configured");
  });

  it("retries a transport failure instead of losing the message", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "WeVoTrip <hello@example.com>";
    // What Vercel actually produced: undici's opaque "fetch failed", with the
    // real errno hidden on `cause`.
    const transport = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED"), {
        code: "ECONNREFUSED",
      }),
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(transport)
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendMagicLinkEmail(
      "traveler@example.com",
      "https://example.com/auth/magic/abc"
    );

    expect(result.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("names the errno behind an opaque 'fetch failed'", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.MAIL_FROM = "WeVoTrip <hello@example.com>";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("fetch failed", {
        cause: Object.assign(
          new Error("getaddrinfo ENOTFOUND api.resend.com"),
          {
            code: "ENOTFOUND",
          }
        ),
      })
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendMagicLinkEmail(
      "traveler@example.com",
      "https://example.com/auth/magic/abc"
    );

    expect(result.delivered).toBe(false);
    // The bare message is useless on its own; the cause is the diagnosis.
    expect(result.error).toContain("ENOTFOUND");
  });

  it("does not retry a refusal — it will only be refused again", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("domain not verified", { status: 403 }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await sendMagicLinkEmail(
      "traveler@example.com",
      "https://example.com/auth/magic/abc"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends with a key that arrived with paste damage", async () => {
    // The exact production value: ASCII SYN (0x16) at index 0, which is what a
    // literal Ctrl+V leaves behind. `trim()` does not remove it — SYN is a
    // control character, not whitespace — so undici refused to build the
    // request and threw UND_ERR_INVALID_ARG before a packet was sent. Three
    // weeks of invitations died here, reported as "fetch failed".
    process.env.RESEND_API_KEY = "\x16re_abc123abc123abc123abc123abc12";
    process.env.MAIL_FROM = "WeVoTrip <hello@wevotrip.com>";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendMagicLinkEmail(
      "traveler@example.com",
      "https://example.com/auth/magic/abc"
    );

    expect(result.delivered).toBe(true);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const auth = (init.headers as Record<string, string>).Authorization;
    expect(auth).toBe("Bearer re_abc123abc123abc123abc123abc12");
    // The property that actually matters: every byte is legal in a header.
    expect(auth).toMatch(/^[\x20-\x7e]+$/);
  });

  it("does not count a control character as part of the key", () => {
    process.env.RESEND_API_KEY = "\x16re_key";
    expect(isEmailConfigured()).toBe(true);
    // Damaged but present is still configured — the app repairs it rather than
    // pretending mail was never set up, which would send the operator to add a
    // key that is already there.
  });

  it("does not count Resend's sandbox sender as able to reach any recipient", () => {
    process.env.RESEND_API_KEY = "re_test_key";

    // A key alone still means onboarding@resend.dev, which only reaches the account owner.
    expect(isEmailConfigured()).toBe(true);
    expect(canEmailAnyRecipient()).toBe(false);

    process.env.MAIL_FROM = "WeVoTrip <hello@verified-domain.com>";
    expect(canEmailAnyRecipient()).toBe(true);
  });

  it("counts SMTP as able to reach any recipient", () => {
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_USER = "sender@example.com";
    process.env.SMTP_PASS = "app-password";

    expect(canEmailAnyRecipient()).toBe(true);
  });

  it("treats a half-configured SMTP block as no provider at all", () => {
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PASS = "app-password";
    // SMTP_USER missing — nodemailer would have nothing to authenticate as.

    expect(isEmailConfigured()).toBe(false);
    expect(canEmailAnyRecipient()).toBe(false);
  });

  it("falls back to SMTP when Resend rejects the send", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "sender@example.com";
    process.env.SMTP_PASS = "app-password";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("domain not verified", { status: 403 })
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    const sendMail = vi.fn().mockResolvedValue({});
    vi.spyOn(nodemailer, "createTransport").mockReturnValue({
      sendMail,
    } as never);

    const result = await sendMagicLinkEmail(
      "someone-else@example.com",
      "https://example.com/auth/magic/abc"
    );

    expect(result.delivered).toBe(true);
    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: "someone-else@example.com",
    });
  });
});
