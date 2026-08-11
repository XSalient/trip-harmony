/**
 * `auth.demoSignIn` issues a session with no password, which is the sort of
 * thing that has to justify itself. The property under test is the one that
 * makes it safe: the account it opens is always a seeded demo account, because
 * the `openId` it looks up is built rather than supplied.
 *
 * The database lookup is stubbed, so these run anywhere. What they assert is
 * the shape of the request that reaches it — which is exactly where a way into
 * a real account would have to appear.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COOKIE_NAME } from "../shared/const.js";
import { DEMO_OPEN_ID_PREFIX } from "../shared/demo.js";
import type { TrpcContext } from "./_core/context.js";

const getUserByOpenId = vi.hoisted(() => vi.fn());

vi.mock("./db.js", async importOriginal => ({
  ...(await importOriginal<typeof import("./db.js")>()),
  getUserByOpenId,
}));

// Minting a real session token needs a configured `JWT_SECRET`, which the test
// environment deliberately does not have. Stubbed, because what is under test
// is which account gets a session — not how the token is signed.
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

type SetCookie = { name: string; value: string };

function createContext() {
  const cookies: SetCookie[] = [];
  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      get: () => undefined,
    } as unknown as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string) => {
        cookies.push({ name, value });
      },
    } as unknown as TrpcContext["res"],
  } as TrpcContext;
  return { ctx, cookies };
}

const demoUser = {
  id: 42,
  openId: `${DEMO_OPEN_ID_PREFIX}ava`,
  name: "Ava Bennett",
  email: "ava@demo.backtotravelling.example",
  passwordHash: null,
  loginMethod: "email",
  role: "user" as const,
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

describe("auth.demoSignIn", () => {
  beforeEach(() => {
    getUserByOpenId.mockReset();
  });

  it("signs a visitor in as a seeded persona and sets the session cookie", async () => {
    getUserByOpenId.mockResolvedValue(demoUser);
    const { ctx, cookies } = createContext();

    const result = await appRouter
      .createCaller(ctx)
      .auth.demoSignIn({ persona: "ava" });

    expect(result).toMatchObject({ success: true, name: "Ava Bennett" });
    expect(cookies.map(c => c.name)).toContain(COOKIE_NAME);
  });

  it("only ever looks up an openId inside the demo namespace", async () => {
    getUserByOpenId.mockResolvedValue(demoUser);
    const { ctx } = createContext();

    await appRouter.createCaller(ctx).auth.demoSignIn({ persona: "nina" });

    expect(getUserByOpenId).toHaveBeenCalledWith(`${DEMO_OPEN_ID_PREFIX}nina`);
  });

  it("refuses a persona that could escape the namespace", async () => {
    const { ctx } = createContext();
    const caller = appRouter.createCaller(ctx);

    // Each of these would, unvalidated, address something other than a seeded
    // demo row — a real account, or every row at once.
    for (const persona of [
      "email:abc123",
      "../admin",
      "ava%",
      "%",
      "AVA",
      "",
    ]) {
      await expect(caller.auth.demoSignIn({ persona })).rejects.toThrow();
    }
    expect(getUserByOpenId).not.toHaveBeenCalled();
  });

  it("is a dead end on a deployment with no demo seeded", async () => {
    getUserByOpenId.mockResolvedValue(null);
    const { ctx, cookies } = createContext();

    await expect(
      appRouter.createCaller(ctx).auth.demoSignIn({ persona: "ava" })
    ).rejects.toThrow(/no demo/i);
    expect(cookies).toHaveLength(0);
  });

  it("never returns credential columns, even for a fictional account", async () => {
    getUserByOpenId.mockResolvedValue({
      ...demoUser,
      passwordHash: "scrypt:should-never-leave-the-server",
    });
    const { ctx } = createContext();

    const result = await appRouter
      .createCaller(ctx)
      .auth.demoSignIn({ persona: "ava" });

    expect(JSON.stringify(result)).not.toContain("scrypt");
  });
});
