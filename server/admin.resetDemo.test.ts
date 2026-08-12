/**
 * `admin.resetDemo` deletes the demo and rebuilds it, from a button. Two things
 * therefore have to hold no matter what else changes: only an app admin can
 * reach it, and it cannot rebuild a shared demo using the password printed in
 * the runbook.
 *
 * `runDemoSeed` is stubbed throughout — what is under test is who gets to call
 * it and with what, not the seeding itself, which the CLI path already covers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DEMO_PASSWORD,
  DEMO_PASSWORD_ENV_VAR,
} from "../shared/demo.js";
import type { TrpcContext } from "./_core/context.js";

const runDemoSeed = vi.hoisted(() => vi.fn());

vi.mock("./demo/seed.js", () => ({
  runDemoSeed,
  DEMO_PEOPLE_COUNT: 11,
}));

const { appRouter } = await import("./routers/index.js");

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function contextFor(role: "admin" | "user" | null): TrpcContext {
  const user: AuthenticatedUser | null =
    role === null
      ? null
      : ({
          id: 2,
          openId: "email:owner",
          email: "owner@example.com",
          name: "Owner",
          loginMethod: "email",
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        } as AuthenticatedUser);

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const seedResult = {
  removed: { trips: 3, people: 11 },
  seeded: [
    { name: "Lisbon & the Algarve", id: 1 },
    { name: "Chamonix", id: 2 },
    { name: "Kyoto", id: 3 },
  ],
  totals: { votes: 150, comments: 14 },
  primaryEmail: "ava@demo.backtotravelling.example",
};

describe("admin.resetDemo", () => {
  beforeEach(() => {
    runDemoSeed.mockReset();
    runDemoSeed.mockResolvedValue(seedResult);
    vi.stubEnv(DEMO_PASSWORD_ENV_VAR, "a-properly-chosen-password");
  });

  it("rebuilds the demo for an app admin and reports what it did", async () => {
    const result = await appRouter
      .createCaller(contextFor("admin"))
      .admin.resetDemo();

    expect(result.removed).toEqual({ trips: 3, people: 11 });
    expect(result.trips).toHaveLength(3);
    expect(result.people).toBe(11);
    expect(runDemoSeed).toHaveBeenCalledWith({
      password: "a-properly-chosen-password",
      mode: "seed",
    });
  });

  it("is closed to an ordinary signed-in user", async () => {
    // The one that matters most: a demo persona is a real signed-in account,
    // and every visitor to the demo becomes one in two clicks.
    await expect(
      appRouter.createCaller(contextFor("user")).admin.resetDemo()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(runDemoSeed).not.toHaveBeenCalled();
  });

  it("is closed to a signed-out visitor", async () => {
    await expect(
      appRouter.createCaller(contextFor(null)).admin.resetDemo()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(runDemoSeed).not.toHaveBeenCalled();
  });

  it("refuses when the server has no demo password", async () => {
    vi.stubEnv(DEMO_PASSWORD_ENV_VAR, "");

    await expect(
      appRouter.createCaller(contextFor("admin")).admin.resetDemo()
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(runDemoSeed).not.toHaveBeenCalled();
  });

  it("refuses the password published in the runbook", async () => {
    // Setting the known password on the server would otherwise rebuild every
    // seeded account with credentials the internet already has.
    vi.stubEnv(DEMO_PASSWORD_ENV_VAR, DEFAULT_DEMO_PASSWORD);

    await expect(
      appRouter.createCaller(contextFor("admin")).admin.resetDemo()
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(runDemoSeed).not.toHaveBeenCalled();
  });

  it("refuses a second reset while one is still running", async () => {
    let release: (value: typeof seedResult) => void = () => {};
    runDemoSeed.mockReturnValue(
      new Promise(resolve => {
        release = resolve;
      })
    );

    const caller = appRouter.createCaller(contextFor("admin"));
    const first = caller.admin.resetDemo();

    await expect(caller.admin.resetDemo()).rejects.toMatchObject({
      code: "CONFLICT",
    });

    release(seedResult);
    await expect(first).resolves.toMatchObject({ people: 11 });
    expect(runDemoSeed).toHaveBeenCalledTimes(1);
  });

  it("lets a later reset through once the first has finished", async () => {
    const caller = appRouter.createCaller(contextFor("admin"));
    await caller.admin.resetDemo();
    await expect(caller.admin.resetDemo()).resolves.toMatchObject({
      people: 11,
    });
    expect(runDemoSeed).toHaveBeenCalledTimes(2);
  });

  it("releases the guard when a reset fails, rather than wedging the button", async () => {
    runDemoSeed.mockRejectedValueOnce(new Error("database went away"));
    const caller = appRouter.createCaller(contextFor("admin"));

    await expect(caller.admin.resetDemo()).rejects.toThrow(/went away/);

    runDemoSeed.mockResolvedValue(seedResult);
    await expect(caller.admin.resetDemo()).resolves.toMatchObject({
      people: 11,
    });
  });
});
