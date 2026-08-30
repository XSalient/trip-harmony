/**
 * `auth.capabilities` tells the landing page what to offer, and `demoTour` is
 * the half of that answer which decides whether "See a real trip" appears at
 * all. The product site and the sales demo are one deployment behind two
 * domains, so this query is the only thing that can tell them apart.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEMO_TOUR_ENV_VAR } from "../shared/demo.js";
import type { TrpcContext } from "./_core/context.js";

const { appRouter } = await import("./routers/index.js");

function contextFor(host: string | undefined): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: host ? { host } : {},
      get: (name: string) => (name.toLowerCase() === "host" ? host : undefined),
    } as unknown as TrpcContext["req"],
    res: { cookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const demoTourOn = (host: string | undefined) =>
  appRouter
    .createCaller(contextFor(host))
    .auth.capabilities()
    .then(c => c.demoTour);

describe("auth.capabilities demoTour", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("is on for the demo subdomain", async () => {
    await expect(demoTourOn("demo.wevotrip.com")).resolves.toBe(true);
  });

  it("is off for the product site", async () => {
    // The reason the flag exists: the same build serves this host.
    await expect(demoTourOn("www.wevotrip.com")).resolves.toBe(false);
    await expect(demoTourOn("wevotrip.com")).resolves.toBe(false);
  });

  it("is on for localhost, so local development needs no configuration", async () => {
    await expect(demoTourOn("localhost:5000")).resolves.toBe(true);
  });

  it("is off when the request carries no host at all", async () => {
    await expect(demoTourOn(undefined)).resolves.toBe(false);
  });

  it("is off on a preview until DEMO_TOUR_ENABLED says otherwise", async () => {
    const preview = "trip-harmony-git-abc123-team.vercel.app";
    await expect(demoTourOn(preview)).resolves.toBe(false);

    vi.stubEnv(DEMO_TOUR_ENV_VAR, "true");
    await expect(demoTourOn(preview)).resolves.toBe(true);
  });

  it("does not treat a negative override as permission", async () => {
    // Opt-in, not a kill switch: anything that is not affirmative leaves the
    // host to decide, and the host says no.
    for (const value of ["false", "0", "off", "no", "", "  "]) {
      vi.stubEnv(DEMO_TOUR_ENV_VAR, value);
      await expect(demoTourOn("www.wevotrip.com")).resolves.toBe(false);
    }
  });

  it("never lets the override turn the demo off where the host allows it", async () => {
    // The override only adds hosts. A demo subdomain stays a demo subdomain.
    vi.stubEnv(DEMO_TOUR_ENV_VAR, "false");
    await expect(demoTourOn("demo.wevotrip.com")).resolves.toBe(true);
  });

  it("still answers the sign-in capabilities it answered before", async () => {
    const caps = await appRouter
      .createCaller(contextFor("www.wevotrip.com"))
      .auth.capabilities();

    expect(caps).toHaveProperty("magicLink");
    expect(caps).toHaveProperty("magicLinkReliable");
  });
});
