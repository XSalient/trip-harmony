/**
 * How often `lastSignedIn` is written.
 *
 * It was written on every request. Fire-and-forget, so it never held anything
 * up directly — but it still took one of the three connections this process is
 * allowed (`POOL_MAX` in `db.ts`, ADR 0012) away from the reads somebody was
 * waiting on, and a trip page costs two requests: the batch, and `auth.me` on
 * its own unbatched link.
 */
import { describe, expect, it } from "vitest";
import { forgetRecordedSignIns, shouldRecordSignIn } from "./sdk.js";

const MINUTE = 60_000;

describe("shouldRecordSignIn", () => {
  it("records the first request from a user", () => {
    forgetRecordedSignIns();
    expect(shouldRecordSignIn("u1", 0)).toBe(true);
  });

  it("skips the ones that follow it closely", () => {
    forgetRecordedSignIns();
    shouldRecordSignIn("u1", 0);
    expect(shouldRecordSignIn("u1", 1_000)).toBe(false);
    expect(shouldRecordSignIn("u1", 5 * MINUTE)).toBe(false);
    // The batch and its unbatched `auth.me` arrive together; this is the pair
    // that used to cost two writes per page.
    expect(shouldRecordSignIn("u1", 20)).toBe(false);
  });

  it("records again once the interval has passed", () => {
    forgetRecordedSignIns();
    shouldRecordSignIn("u1", 0);
    expect(shouldRecordSignIn("u1", 10 * MINUTE)).toBe(true);
  });

  it("counts from the last write, not the first", () => {
    forgetRecordedSignIns();
    shouldRecordSignIn("u1", 0);
    shouldRecordSignIn("u1", 10 * MINUTE);
    expect(shouldRecordSignIn("u1", 15 * MINUTE)).toBe(false);
    expect(shouldRecordSignIn("u1", 20 * MINUTE)).toBe(true);
  });

  it("tracks each user separately", () => {
    forgetRecordedSignIns();
    shouldRecordSignIn("u1", 0);
    // One busy person must not stop everyone else's being recorded at all.
    expect(shouldRecordSignIn("u2", 1_000)).toBe(true);
  });
});
