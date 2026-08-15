/**
 * Telling "you are signed out" apart from "we could not find out".
 *
 * `authenticateRequest` throws for both — a missing cookie and a database that
 * would not answer look identical from the outside — and the context used to
 * catch the lot and set `user = null`. A transient database blip therefore
 * presented as a signed-out session: every protected procedure answered "Please
 * login (10001)", and the client, which redirects on exactly that message,
 * threw you back to the landing page mid-trip.
 */
import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { ForbiddenError } from "../../shared/_core/errors.js";
import { UNAUTHED_ERR_MSG } from "../../shared/const.js";

const authenticateRequest = vi.fn();

vi.mock("./sdk.js", async importOriginal => {
  const actual = await importOriginal<typeof import("./sdk.js")>();
  return { ...actual, sdk: { ...actual.sdk, authenticateRequest } };
});

const { createContext } = await import("./context.js");
// Hoisted: loading the whole router tree costs more than a test timeout allows.
const { appRouter } = await import("../routers/index.js");

type ContextOpts = Parameters<typeof createContext>[0];

const opts = () =>
  ({
    req: { requestId: "test-request", headers: {} },
    res: {},
  }) as unknown as ContextOpts;

describe("createContext", () => {
  it("carries the user through when the session verifies", async () => {
    authenticateRequest.mockResolvedValueOnce({ id: 7, name: "Ava" });

    const ctx = await createContext(opts());

    expect(ctx.user).toMatchObject({ id: 7 });
    expect(ctx.authFailed).toBeFalsy();
  });

  it("reports no user for a session that is genuinely not valid", async () => {
    authenticateRequest.mockRejectedValueOnce(
      ForbiddenError("Invalid session cookie")
    );

    const ctx = await createContext(opts());

    expect(ctx.user).toBeNull();
    expect(ctx.authFailed).toBeFalsy();
  });

  it("does not call an infrastructure failure a signed-out session", async () => {
    authenticateRequest.mockRejectedValueOnce(
      new Error("terminating connection due to administrator command")
    );

    const ctx = await createContext(opts());

    expect(ctx.user).toBeNull();
    // The distinction the whole fix rests on: we do not know who this is, and
    // saying "signed out" would sign them out.
    expect(ctx.authFailed).toBe(true);
  });
});

describe("a procedure asked to run when auth could not be determined", () => {
  /** Built by hand: the router only ever sees the context, not how it was made. */
  const indeterminateCtx = () =>
    ({
      user: null,
      authFailed: true,
      requestId: "test-request",
      req: { protocol: "https", headers: {} },
      res: { clearCookie: () => {} },
    }) as unknown as Awaited<ReturnType<typeof createContext>>;

  it("fails loudly instead of answering 'please login'", async () => {
    const caller = appRouter.createCaller(indeterminateCtx());

    await expect(caller.trips.list()).rejects.toSatisfy(
      (error: TRPCError) =>
        error.code === "INTERNAL_SERVER_ERROR" &&
        error.message !== UNAUTHED_ERR_MSG
    );
  });

  /**
   * `auth.me` is public and would otherwise cheerfully report `null`, which is
   * the client's definition of signed out — the redirect fires on that alone,
   * without any protected procedure having to fail first.
   */
  it("refuses to report auth.me as signed out", async () => {
    const caller = appRouter.createCaller(indeterminateCtx());

    await expect(caller.auth.me()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
