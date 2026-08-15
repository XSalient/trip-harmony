/**
 * The recorder itself: `recordProductEvent` in `server/db.ts`.
 *
 * Two properties, and they are the two that would be expensive to discover in
 * production. It must never throw — measurement is not worth failing a member's
 * action over — and it must filter metadata through the contract before the
 * insert, so the promise in `shared/productEvents.ts` is kept in one place
 * rather than at eleven call sites.
 *
 * Runs with no database: `getDb()` returns null when no connection string is
 * configured, which exercises everything up to the insert.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recordProductEvent } from "./db.js";

const dbSource = readFileSync(join(import.meta.dirname, "db.ts"), "utf8");
const recorder = dbSource.slice(
  dbSource.indexOf("export async function recordProductEvent("),
  dbSource.indexOf("export async function getProductEvents(")
);

describe("recordProductEvent never breaks the caller's action", () => {
  it("resolves rather than throwing when there is no database", async () => {
    await expect(
      recordProductEvent({
        event: "trip.created",
        tripId: 1,
        actorUserId: 1,
        metadata: { cloned: false },
      })
    ).resolves.toBeUndefined();
  });

  it("resolves for an event with no trip and no actor", async () => {
    await expect(
      recordProductEvent({ event: "trip.completed" })
    ).resolves.toBeUndefined();
  });

  it("resolves even when handed metadata the contract refuses", async () => {
    await expect(
      recordProductEvent({
        event: "invite.sent",
        tripId: 1,
        metadata: { role: "ada@example.com", note: "call her first" },
      })
    ).resolves.toBeUndefined();
  });

  it("swallows and logs rather than throwing, in the source", () => {
    // Same guard `recordActivity` carries, asserted the same way: a `throw`
    // anywhere in this function would make a metrics blip a failed trip.
    expect(recorder).toContain("try {");
    expect(recorder).toContain("log.warn");
    expect(recorder).not.toContain("throw");
  });
});

describe("the privacy filter is applied by the recorder, not by call sites", () => {
  it("sanitises before it inserts", () => {
    const sanitised = recorder.indexOf("sanitiseProductEventMetadata");
    const insert = recorder.indexOf("db.insert(productEvents)");
    expect(sanitised).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(sanitised);
  });

  it("inserts the sanitised object and never the caller's own", () => {
    // `entry.metadata` reaching JSON.stringify would defeat the whole contract.
    expect(recorder).toContain("JSON.stringify(metadata)");
    expect(recorder).not.toContain("JSON.stringify(entry.metadata)");
  });
});

describe("no call site writes a product event by hand", () => {
  it("routes every one through the recorder", () => {
    // A stray `db.insert(productEvents)` elsewhere would bypass the filter.
    const insertions = dbSource.split("insert(productEvents)").length - 1;
    expect(insertions).toBe(1);
  });
});
