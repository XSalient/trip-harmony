/**
 * The session token reaches a native client, and nobody else.
 *
 * The web's session is an `httpOnly` cookie precisely so page script cannot
 * read it: an XSS that could would hold a year-long credential. The native
 * builds cannot use that cookie — in a Capacitor WebView the page's origin is
 * `capacitor://localhost`, so the cookie for the API's domain is third-party
 * and iOS drops it — so the same JWT has to come back in a response body there.
 *
 * Handing it to the wrong caller would undo the cookie's whole purpose. "Only
 * to a WebView origin" is therefore the security property of this change, and
 * these tests are what hold it in place.
 *
 * Signing is stubbed, following `auth.demoSignIn.test.ts`: the test environment
 * has no `JWT_SECRET`, and what is under test is who receives a token rather
 * than how it is signed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_NAME } from "../shared/const.js";
import { DEMO_OPEN_ID_PREFIX } from "../shared/demo.js";
import { isNativeOrigin, NATIVE_ORIGINS } from "../shared/native.js";
import type { TrpcContext } from "./_core/context.js";

const getUserByOpenId = vi.hoisted(() => vi.fn());

vi.mock("./db.js", async importOriginal => ({
  ...(await importOriginal<typeof import("./db.js")>()),
  getUserByOpenId,
}));

vi.mock("./_core/sdk.js", async importOriginal => {
  const actual = await importOriginal<typeof import("./_core/sdk.js")>();
  return {
    ...actual,
    sdk: {
      ...actual.sdk,
      createSessionToken: vi.fn(async () => "stub-session-token"),
    },
  };
});

const { appRouter } = await import("./routers/index.js");

const read = (relative: string) =>
  readFileSync(join(import.meta.dirname, relative), "utf8");

describe("isNativeOrigin", () => {
  it("accepts the WebView origins", () => {
    for (const origin of NATIVE_ORIGINS) {
      expect(isNativeOrigin(origin), origin).toBe(true);
    }
  });

  it("rejects the web, including local development", () => {
    for (const origin of [
      "https://wevotrip.com",
      // The local dev server. Accepting it would hand a readable token to
      // every browser tab a developer has open.
      "http://localhost:5000",
      "http://localhost",
      undefined,
      null,
      "",
    ]) {
      expect(isNativeOrigin(origin), String(origin)).toBe(false);
    }
  });

  /**
   * The mistake a `startsWith` would make: `localhost.evil.example` is a domain
   * anybody can register, and it begins with an accepted origin.
   */
  it("matches exactly, so a lookalike domain cannot pass", () => {
    for (const origin of [
      "https://localhost.evil.example",
      "capacitor://localhost.evil.example",
      "https://localhost@evil.example",
      "https://evil.example/#https://localhost",
      "https://localhost:1234",
    ]) {
      expect(isNativeOrigin(origin), origin).toBe(false);
    }
  });
});

const demoUser = {
  id: 42,
  openId: `${DEMO_OPEN_ID_PREFIX}ava`,
  name: "Ava Bennett",
  email: "ava@demo.wevotrip.example",
  passwordHash: null,
  loginMethod: "email",
  role: "user" as const,
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

/** A sign-in request from `origin`, on the demo's own host. */
function createContext(origin: string | undefined) {
  const host = "demo.wevotrip.com";
  const headers: Record<string, string> = { host };
  if (origin) headers.origin = origin;
  const cookies: string[] = [];

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers,
      get: (name: string) => headers[name.toLowerCase()],
    } as unknown as TrpcContext["req"],
    res: {
      cookie: (name: string) => {
        cookies.push(name);
      },
    } as unknown as TrpcContext["res"],
  } as TrpcContext;
  return { ctx, cookies };
}

describe("who gets the session token in the response body", () => {
  beforeEach(() => {
    getUserByOpenId.mockReset();
    getUserByOpenId.mockResolvedValue(demoUser);
  });

  it("gives it to a Capacitor WebView", async () => {
    for (const origin of NATIVE_ORIGINS) {
      const { ctx } = createContext(origin);
      const result = await appRouter
        .createCaller(ctx)
        .auth.demoSignIn({ persona: "ava" });
      expect(result, origin).toMatchObject({
        success: true,
        sessionToken: "stub-session-token",
      });
    }
  });

  it("withholds it from the web", async () => {
    for (const origin of [
      "https://wevotrip.com",
      "http://localhost:5000",
      "https://localhost.evil.example",
      undefined, // a same-origin request sends no Origin at all
    ]) {
      const { ctx } = createContext(origin);
      const result = await appRouter
        .createCaller(ctx)
        .auth.demoSignIn({ persona: "ava" });
      expect(result, String(origin)).toMatchObject({ success: true });
      expect(result, String(origin)).not.toHaveProperty("sessionToken");
    }
  });

  it("still sets the cookie for everyone", async () => {
    // The native builds ignore it and it costs nothing there; removing it would
    // break the web, which is the only client that can actually use it.
    for (const origin of ["capacitor://localhost", undefined]) {
      const { cookies, ctx } = createContext(origin);
      await appRouter.createCaller(ctx).auth.demoSignIn({ persona: "ava" });
      expect(cookies, String(origin)).toContain(COOKIE_NAME);
    }
  });
});

describe("the bearer header is an addition, not a replacement", () => {
  it("reads the cookie first, and only then the header", () => {
    const src = read("./_core/sdk.ts");
    const fn = src.slice(
      src.indexOf("private sessionTokenOf"),
      src.indexOf("async authenticateRequest")
    );
    // An injected header must not be able to override a real cookie session.
    expect(fn).toContain("if (fromCookie) return fromCookie;");
    expect(fn.indexOf("fromCookie")).toBeLessThan(fn.indexOf("BEARER_PREFIX"));
  });

  it("accepts only a Bearer token, and not an empty one", () => {
    const src = read("./_core/sdk.ts");
    const fn = src.slice(
      src.indexOf("private sessionTokenOf"),
      src.indexOf("async authenticateRequest")
    );
    expect(fn).toContain("startsWith(BEARER_PREFIX)");
    // `Bearer ` with nothing after it must be undefined, not "".
    expect(fn).toContain("return token || undefined;");
  });
});

describe("sessions are minted in one place", () => {
  it("no sign-in procedure mints its own", () => {
    // Five procedures sign somebody in. One that still minted its own token
    // would skip the origin rule above — and it would be the one nobody tested.
    for (const file of ["./routers/auth.ts", "./routers/passkeys.ts"]) {
      expect(read(file), `${file} must go through issueSession`).not.toContain(
        "createSessionToken"
      );
    }
  });

  it("issueSession gates on the origin and still sets the cookie", () => {
    const src = read("./routers/_shared.ts");
    const fn = src.slice(
      src.indexOf("export async function issueSession"),
      src.indexOf("export async function requireTripAllowance")
    );
    expect(fn).toContain("isNativeOrigin");
    expect(fn).toContain("ctx.res.cookie");
  });
});
