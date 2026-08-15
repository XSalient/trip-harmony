/**
 * The measurement contract, tested as the privacy boundary it is.
 *
 * `sanitiseProductEventMetadata` is the only thing standing between a careless
 * call site and a name, an email address or a paragraph of somebody's
 * requirements ending up in a metrics table. So the assertions here are mostly
 * about what it refuses, not what it keeps.
 */
import { describe, expect, it } from "vitest";
import {
  PRODUCT_EVENTS,
  PRODUCT_EVENT_FIELDS,
  isProductEvent,
  sanitiseProductEventMetadata,
  type ProductEvent,
} from "./productEvents.js";

describe("the event vocabulary", () => {
  it("covers every event the beta set out to measure", () => {
    // Keyed by the request, so a renamed event has to be re-read against what
    // it was meant to answer rather than quietly disappearing.
    const asked: Record<string, ProductEvent> = {
      "trip created": "trip.created",
      "invite sent": "invite.sent",
      "invite accepted": "invite.accepted",
      "trip preference saved": "preference.saved",
      "proposal created": "proposal.created",
      "vote cast or changed": "vote.recorded",
      "AI referee run": "referee.run",
      "date finalised": "dates.finalised",
      "accommodation finalised": "accommodation.finalised",
      "trip marked complete": "trip.completed",
      "trip marked cancelled": "trip.cancelled",
    };
    for (const [what, event] of Object.entries(asked))
      expect(PRODUCT_EVENTS, what).toContain(event);
  });

  it("answers 'a budget was proposed' as a proposal kind, not an event", () => {
    // Budget stopped being an expense journal and became a proposal type like
    // the other three, so the question the beta asked is still answered — by
    // `proposal.created` with `kind: "budget"` rather than by an event of its
    // own, which would have counted the same act twice.
    expect(PRODUCT_EVENTS).not.toContain("budget.item_added");
    const kind = PRODUCT_EVENT_FIELDS["proposal.created"].kind;
    expect(kind.kind).toBe("enum");
    if (kind.kind === "enum") expect(kind.values).toContain("budget");
  });

  it("names events <entity>.<verb>, like the activity trail", () => {
    for (const event of PRODUCT_EVENTS)
      expect(event).toMatch(/^[a-z]+\.[a-z_]+$/);
  });

  it("has no duplicates and no name too long for the column", () => {
    expect(new Set(PRODUCT_EVENTS).size).toBe(PRODUCT_EVENTS.length);
    for (const event of PRODUCT_EVENTS)
      expect(event.length).toBeLessThanOrEqual(48);
  });

  it("describes the fields of every event, including the ones with none", () => {
    for (const event of PRODUCT_EVENTS)
      expect(PRODUCT_EVENT_FIELDS[event], event).toBeDefined();
  });

  it("recognises its own names and nothing else", () => {
    expect(isProductEvent("trip.created")).toBe(true);
    expect(isProductEvent("trip.renamed")).toBe(false);
  });
});

describe("no field can carry free text", () => {
  it("admits only enums, booleans and counts", () => {
    for (const [event, fields] of Object.entries(PRODUCT_EVENT_FIELDS))
      for (const [field, spec] of Object.entries(fields))
        expect(["boolean", "count", "enum"], `${event}.${field}`).toContain(
          spec.kind
        );
  });

  it("keeps enum vocabularies small and closed", () => {
    for (const [event, fields] of Object.entries(PRODUCT_EVENT_FIELDS))
      for (const [field, spec] of Object.entries(fields)) {
        if (spec.kind !== "enum") continue;
        // A long or open list is how a "category" becomes a place to put a
        // name. These are all fixed vocabularies from the schema's own enums.
        expect(spec.values.length, `${event}.${field}`).toBeLessThanOrEqual(8);
        for (const value of spec.values)
          expect(value).toMatch(/^[a-z_]{1,24}$/);
      }
  });
});

describe("sanitising metadata", () => {
  it("keeps what the contract describes", () => {
    const { metadata, rejected } = sanitiseProductEventMetadata(
      "vote.recorded",
      { kind: "destination", changed: true }
    );
    expect(metadata).toEqual({ kind: "destination", changed: true });
    expect(rejected).toEqual([]);
  });

  it("drops a field the event does not declare", () => {
    const { metadata, rejected } = sanitiseProductEventMetadata(
      "trip.created",
      {
        cloned: false,
        name: "Ada's birthday in Girona",
      }
    );
    expect(metadata).toEqual({ cloned: false });
    expect(rejected).toEqual(["name"]);
  });

  it("drops an email even where a string is expected", () => {
    // `invite.sent` has a string field. It is an enum of three roles, so an
    // address has nowhere to land — which is the whole point of enums here.
    const { metadata, rejected } = sanitiseProductEventMetadata("invite.sent", {
      role: "ada@example.com",
    });
    expect(metadata).toEqual({});
    expect(rejected).toEqual(["role"]);
    expect(JSON.stringify(metadata)).not.toContain("@");
  });

  it("drops preference text offered as a count", () => {
    const { metadata, rejected } = sanitiseProductEventMetadata(
      "preference.saved",
      { sections: "must have a pool and no early flights" }
    );
    expect(metadata).toEqual({});
    expect(rejected).toEqual(["sections"]);
  });

  it("refuses a count that is not a whole number of things", () => {
    for (const sections of [-1, 1.5, Number.NaN, Infinity]) {
      const { metadata } = sanitiseProductEventMetadata("preference.saved", {
        sections,
      });
      expect(metadata, String(sections)).toEqual({});
    }
    expect(
      sanitiseProductEventMetadata("preference.saved", { sections: 0 }).metadata
    ).toEqual({ sections: 0 });
  });

  it("refuses a boolean written as a string", () => {
    const { metadata } = sanitiseProductEventMetadata("trip.created", {
      cloned: "true",
    });
    expect(metadata).toEqual({});
  });

  it("drops everything for an event that declares no fields", () => {
    const { metadata, rejected } = sanitiseProductEventMetadata(
      "dates.finalised",
      { proposalLabel: "Whitsun week", nights: 7 }
    );
    expect(metadata).toEqual({});
    expect(rejected.sort()).toEqual(["nights", "proposalLabel"]);
  });

  it("handles no metadata at all", () => {
    expect(sanitiseProductEventMetadata("trip.completed", undefined)).toEqual({
      metadata: {},
      rejected: [],
    });
  });
});
