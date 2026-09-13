/**
 * `/api/health` used to hand `describeConfig()` to anybody who asked, under a
 * comment claiming it leaked nothing sensitive.
 *
 * What it actually published, unauthenticated, was the shape of the
 * deployment: which variable supplied the database URL and the AI key, the
 * model in use, the pool cap, the log level, which scraper vendor sits in the
 * path, whether billing and OAuth are wired up, and the exact commit running.
 * None of that is a secret on its own. Together it is a map of what this thing
 * is made of and which parts are soft, free to anyone who typed the path.
 *
 * A liveness probe needs one bit: is the process up. So that is all an
 * anonymous caller gets now, and the detail sits behind the same admin check
 * as `system.diagnostics`. This boots the real app and asks over HTTP, because
 * the property worth pinning is what comes out of the socket.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { createApp } from "./_core/app.js";
import { sdk } from "./_core/sdk.js";

let server: Server;
let origin: string;

beforeAll(async () => {
  ({ server } = await createApp({ serveClient: false }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => {
    server.close(() => resolve());
  });
});

/** Every key the old handler published to the world. */
const DISCLOSED_KEYS = [
  "appEnv",
  "database",
  "databaseSource",
  "databasePoolMax",
  "ai",
  "aiKeySource",
  "aiModel",
  "logLevel",
  "scraper",
  "oauth",
  "billing",
  "sessionSecret",
  "commit",
];

describe("/api/health", () => {
  it("tells an anonymous caller that the process is up, and nothing else", async () => {
    const res = await fetch(`${origin}/api/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
  });

  it("publishes none of the configuration it used to", async () => {
    const body = await (await fetch(`${origin}/api/health`)).json();

    for (const key of DISCLOSED_KEYS) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it("stays a usable liveness probe", async () => {
    // The reason it is still this URL and still a 200: uptime checks and the
    // runbooks are already pointed at it.
    const res = await fetch(`${origin}/api/health`);
    expect(res.ok).toBe(true);
    expect((await res.json()).status).toBe("ok");
  });

  it("gives a signed-in non-admin no more than an anonymous caller", async () => {
    vi.spyOn(sdk, "authenticateRequest").mockResolvedValue({
      id: 2,
      role: "user",
    } as never);

    const body = await (await fetch(`${origin}/api/health`)).json();

    expect(body).toEqual({ status: "ok" });
    vi.restoreAllMocks();
  });

  it("gives an admin the configuration summary", async () => {
    vi.spyOn(sdk, "authenticateRequest").mockResolvedValue({
      id: 1,
      role: "admin",
    } as never);

    const body = await (await fetch(`${origin}/api/health`)).json();

    expect(body.status).toBe("ok");
    // The detail is the point of keeping the route at all — an admin curling it
    // is how this gets read from a terminal.
    expect(body).toHaveProperty("appEnv");
    expect(body).toHaveProperty("database");
    vi.restoreAllMocks();
  });
});
