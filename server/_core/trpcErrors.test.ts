/**
 * What a client is allowed to be told about a server fault.
 *
 * Written after a user saw this in a toast:
 *
 *   Failed query: select "id", "openId", "name", "email", "passwordHash", …
 *   from "users" where "users"."email" = $1 params: someone@example.com,1
 *
 * drizzle's message for any failed query, put into the response by tRPC. It
 * published the column list — `passwordHash` included — and the address of
 * whoever was signing in, and told them nothing they could act on.
 *
 * The cases below are the ones that must not regress: that message is replaced,
 * and the deliberate ones are not.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { z } from "zod";

import {
  clientSafeMessage,
  flattenCauses,
  readableValidationMessage,
} from "./trpcErrors.js";

/**
 * `clientSafeMessage` only redacts on a deployed environment; locally the
 * developer is the user and the detail is the point. Tests run as `test`, so
 * the deployed cases have to say so.
 */
const config = await import("./env.js").then(m => m.config);

function asDeployed<T>(fn: () => T): T {
  const spy = vi.spyOn(config, "isDeployed", "get").mockReturnValue(true);
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

const DRIZZLE_LEAK = {
  code: "INTERNAL_SERVER_ERROR",
  message:
    'Failed query: select "id", "openId", "name", "email", "passwordHash", ' +
    '"loginMethod", "role" from "users" where "users"."email" = $1 limit $2 ' +
    "params: someone@example.com,1",
  cause: new Error('column "deletedAt" does not exist'),
};

describe("clientSafeMessage", () => {
  it("replaces a wrapped database error on a deployed environment", () => {
    const safe = asDeployed(() => clientSafeMessage(DRIZZLE_LEAK, "req-123"));
    expect(safe).toBeTruthy();
    // The three things that must not survive: the column list, the table, and
    // the parameters — which included a real person's email address.
    expect(safe).not.toContain("passwordHash");
    expect(safe).not.toContain("users");
    expect(safe).not.toContain("someone@example.com");
    expect(safe).not.toContain("Failed query");
  });

  it("quotes the request id, so a screenshot leads to the log entry", () => {
    const safe = asDeployed(() => clientSafeMessage(DRIZZLE_LEAK, "req-123"));
    expect(safe).toContain("req-123");
  });

  it("still says something useful when there is no request id", () => {
    const safe = asDeployed(() => clientSafeMessage(DRIZZLE_LEAK, undefined));
    expect(safe).toBeTruthy();
    expect(safe).not.toContain("undefined");
  });

  /**
   * The distinction the whole thing turns on. A hand-written TRPCError carries
   * no `cause`; `auth.me` uses exactly that shape to say "Could not verify your
   * session", which is written for a person to read.
   */
  it("leaves a deliberate internal message alone", () => {
    const deliberate = {
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not verify your session. Please try again.",
    };
    expect(asDeployed(() => clientSafeMessage(deliberate, "req-1"))).toBe(null);
  });

  it("never touches any other code", () => {
    for (const code of [
      "BAD_REQUEST",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "CONFLICT",
      "PRECONDITION_FAILED",
    ]) {
      // The client matches some of these by exact string — the paywall, the
      // login redirect, the content filter naming the word it objected to.
      const err = {
        code,
        message: "a message written for a person",
        cause: {},
      };
      expect(
        asDeployed(() => clientSafeMessage(err, "req-1")),
        code
      ).toBe(null);
    }
  });

  it("keeps the raw message in local development", () => {
    // Not deployed: `config.isDeployed` is false under `test`.
    expect(clientSafeMessage(DRIZZLE_LEAK, "req-1")).toBe(null);
  });
});

describe("flattenCauses", () => {
  it("walks the chain so the real cause reaches the log", () => {
    const root = Object.assign(new Error("connect ETIMEDOUT"), {
      code: "ETIMEDOUT",
      address: "10.0.0.1",
      port: 5432,
    });
    const wrapped = Object.assign(new Error("Failed query: select 1"), {
      cause: root,
    });

    const chain = flattenCauses(wrapped);
    expect(chain).toHaveLength(1);
    expect(chain[0]).toMatchObject({
      message: "connect ETIMEDOUT",
      code: "ETIMEDOUT",
      address: "10.0.0.1:5432",
    });
  });

  it("stops rather than looping on a cycle", () => {
    const a: { message: string; cause?: unknown } = { message: "a" };
    const b = { message: "b", cause: a };
    a.cause = b;
    expect(flattenCauses({ cause: a }).length).toBeLessThanOrEqual(5);
  });
});

/**
 * tRPC reports an input-validation failure as a `BAD_REQUEST` whose `cause` is
 * the `ZodError`, and a `ZodError`'s own message is `JSON.stringify` of its
 * issues — so a malformed email produced a wall of `{"origin":"string",
 * "code":"invalid_format","pattern":"/^(?!\\.)…"}` in a toast.
 */
describe("readableValidationMessage", () => {
  /** The failure exactly as tRPC hands it to the formatter. */
  function badRequestFrom(schema: z.ZodType, input: unknown) {
    try {
      schema.parse(input);
      throw new Error("expected the schema to reject this");
    } catch (cause) {
      return { code: "BAD_REQUEST", cause };
    }
  }

  const login = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  it("turns a schema dump into a sentence", () => {
    const message = readableValidationMessage(
      badRequestFrom(login, { email: "not-an-email", password: "" })
    );
    expect(message).toBeTruthy();
    expect(message).toContain("email");
    // The three things that made the old message unreadable.
    expect(message).not.toContain("{");
    expect(message).not.toContain('"code"');
    expect(message).not.toContain("pattern");
  });

  it("names the field, so somebody knows which box to fix", () => {
    const message = readableValidationMessage(
      badRequestFrom(login, { email: "nope", password: "hunter2" })
    );
    expect(message).toMatch(/email/);
  });

  it("caps how many problems it lists", () => {
    // Eight clauses joined by semicolons is a message nobody finishes reading.
    const wide = z.object({
      a: z.string(),
      b: z.string(),
      c: z.string(),
      d: z.string(),
      e: z.string(),
      f: z.string(),
    });
    const message = readableValidationMessage(badRequestFrom(wide, {}))!;
    expect(message.split(";").length).toBeLessThanOrEqual(3);
  });

  it("ignores anything that is not a validation failure", () => {
    // A deliberate BAD_REQUEST — the content filter naming the word it
    // objected to — must keep its own message.
    expect(
      readableValidationMessage({
        code: "BAD_REQUEST",
        cause: new Error("not a zod error"),
      })
    ).toBe(null);
    expect(readableValidationMessage({ code: "BAD_REQUEST" })).toBe(null);
    expect(
      readableValidationMessage({
        code: "INTERNAL_SERVER_ERROR",
        cause: new Error("boom"),
      })
    ).toBe(null);
  });
});
