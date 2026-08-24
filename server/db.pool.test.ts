import { EventEmitter } from "node:events";
import { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ResilientPool,
  acquireWithRetry,
  isPoolSaturationError,
} from "./db.js";

/** What Supavisor sends back when the project's session slots are all taken. */
const saturated = Object.assign(
  new Error(
    "(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15"
  ),
  { code: "XX000" }
);

/** Drizzle rewraps the driver error, so the cause chain is what we actually see. */
const wrapped = new Error("Failed query: select 1", { cause: saturated });

describe("isPoolSaturationError", () => {
  it("recognises the pooler turning a connection away", () => {
    expect(isPoolSaturationError(saturated)).toBe(true);
  });

  it("sees through the wrapper drizzle puts around it", () => {
    expect(isPoolSaturationError(wrapped)).toBe(true);
  });

  it("matches on the code and message together, not XX000 alone", () => {
    const other = Object.assign(new Error("internal error"), { code: "XX000" });
    expect(isPoolSaturationError(other)).toBe(false);
  });

  it("leaves ordinary failures alone", () => {
    expect(isPoolSaturationError(new Error("connect ECONNREFUSED"))).toBe(
      false
    );
    expect(isPoolSaturationError(undefined)).toBe(false);
  });
});

describe("acquireWithRetry", () => {
  const noWait = vi.fn(async () => {});

  it("returns the connection when there is one to be had", async () => {
    const acquire = vi.fn(async () => "client");
    await expect(acquireWithRetry(acquire, { wait: noWait })).resolves.toBe(
      "client"
    );
    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it("waits out a busy pooler rather than failing the request", async () => {
    const acquire = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(wrapped)
      .mockResolvedValueOnce("client");
    const wait = vi.fn(async () => {});
    await expect(acquireWithRetry(acquire, { wait })).resolves.toBe("client");
    expect(wait).toHaveBeenCalledWith(60);
  });

  it("gives up once the delays run out", async () => {
    const acquire = vi.fn(async () => {
      throw wrapped;
    });
    await expect(
      acquireWithRetry(acquire, { delays: [1, 2], wait: noWait })
    ).rejects.toBe(wrapped);
    expect(acquire).toHaveBeenCalledTimes(3);
  });

  it("does not retry a failure the pooler had nothing to do with", async () => {
    const boom = new Error("password authentication failed");
    const acquire = vi.fn(async () => {
      throw boom;
    });
    await expect(acquireWithRetry(acquire, { wait: noWait })).rejects.toBe(
      boom
    );
    expect(acquire).toHaveBeenCalledTimes(1);
  });
});

describe("ResilientPool", () => {
  /** Enough of a pg client for `Pool.query` to drive. */
  function fakeClient(answer: unknown) {
    return Object.assign(new EventEmitter(), {
      query: (
        _text: unknown,
        _values: unknown,
        cb: (err: Error | undefined, res: unknown) => void
      ) => cb(undefined, answer),
      release: vi.fn(),
    });
  }

  afterEach(() => vi.restoreAllMocks());

  it("retries a query the pooler refused, without the caller noticing", async () => {
    const client = fakeClient({ rows: [{ ok: 1 }] });
    const connect = vi
      .spyOn(Pool.prototype, "connect")
      .mockRejectedValueOnce(wrapped)
      .mockResolvedValueOnce(client as unknown as never);

    const pool = new ResilientPool();
    await expect(pool.query("select 1")).resolves.toEqual({
      rows: [{ ok: 1 }],
    });
    expect(connect).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenCalled();
  });

  it("reports a failure it cannot retry to the caller", async () => {
    const boom = new Error("connect ECONNREFUSED");
    vi.spyOn(Pool.prototype, "connect").mockRejectedValue(boom);
    const pool = new ResilientPool();
    await expect(pool.query("select 1")).rejects.toBe(boom);
  });
});
