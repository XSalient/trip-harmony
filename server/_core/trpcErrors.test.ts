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
    // The three things that made the old message unreadable.
    expect(message).not.toContain("{");
    expect(message).not.toContain('"code"');
    expect(message).not.toContain("pattern");
    expect(message).toBe(
      "That does not look like an email address; Password is required"
    );
  });

  it("says a missing field is required, not that it received undefined", () => {
    // Zod reports a missing key as a type error against `undefined`, which is
    // what produced "expected string, received undefined at \"name\"".
    const register = z.object({
      name: z.string().min(1).max(100),
      email: z.string().email(),
      password: z.string().min(8),
    });
    expect(
      readableValidationMessage(badRequestFrom(register, { email: "a@b.com" }))
    ).toBe("Name is required; Password is required");
  });

  it("names a length limit in a way somebody can act on", () => {
    expect(
      readableValidationMessage(
        badRequestFrom(z.object({ name: z.string().min(1).max(255) }), {
          name: "x".repeat(300),
        })
      )
    ).toBe("Name must be 255 characters or fewer");

    expect(
      readableValidationMessage(
        badRequestFrom(z.object({ password: z.string().min(8) }), {
          password: "abc",
        })
      )
    ).toBe("Password must be at least 8 characters");
  });

  /**
   * Sentence case, not title case: "Must Haves" reads like a heading, and the
   * field is being named inside a sentence.
   */
  it("says a camelCase field the way a person would", () => {
    expect(
      readableValidationMessage(
        badRequestFrom(z.object({ mustHaves: z.string() }), { mustHaves: 5 })
      )
    ).toBe("Must haves is not valid");

    expect(
      readableValidationMessage(
        badRequestFrom(z.object({ openComments: z.string() }), {
          openComments: 5,
        })
      )
    ).toBe("Open comments is not valid");
  });

  it("handles an enum without printing the whole option list twice", () => {
    expect(
      readableValidationMessage(
        badRequestFrom(z.object({ reason: z.enum(["spam", "harassment"]) }), {
          reason: "banana",
        })
      )
    ).toBe("Reason is not one of the allowed values");
  });

  it("matches the wording the client's own forms use", () => {
    // `AuthDialog` says "Name is required" and "Password must be at least 8
    // characters" by hand. The backstop should not sound like a different
    // program.
    const fromServer = readableValidationMessage(
      badRequestFrom(z.object({ name: z.string().min(1) }), { name: "" })
    );
    expect(fromServer).toBe("Name is required");
  });

  /**
   * Zod's finalized issues drop `input`, so a missing key and a wrong type
   * arrive as the same code and are told apart only by zod's default wording.
   * If that wording changes this test fails — which is the point, because the
   * alternative is noticing through a confusing message in production.
   */
  it("tells a missing field apart from a wrong type", () => {
    const schema = z.object({ mustHaves: z.string() });
    expect(readableValidationMessage(badRequestFrom(schema, {}))).toBe(
      "Must haves is required"
    );
    expect(
      readableValidationMessage(badRequestFrom(schema, { mustHaves: 5 }))
    ).toBe("Must haves is not valid");
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

  /**
   * An issue code nobody anticipated must still produce something readable.
   * The library keeps that promise; a half-translated sentence would not.
   */
  it("falls back to the library for a code it does not map", () => {
    const custom = z.string().superRefine((_value, ctx) => {
      ctx.addIssue({ code: "custom", message: "that will not do" });
    });
    const message = readableValidationMessage(badRequestFrom(custom, "x"));
    expect(message).toBeTruthy();
    // The library sentence-cases what it is given, so match case-insensitively.
    expect(message?.toLowerCase()).toContain("that will not do");
    expect(message).not.toContain("{");
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
