/**
 * The product-measurement contract: every event the beta records, and the only
 * metadata each one may carry.
 *
 * Measurement is first-party and server-side. There is no analytics vendor, no
 * client-side beacon and no session replay — the events are rows in this
 * application's own database, written by the same procedures that perform the
 * action. See `docs/adr/0024-first-party-product-measurement.md`.
 *
 * The privacy rule is enforced here rather than trusted to call sites: an event
 * carries an enum, a boolean or a count and nothing else. Names, email
 * addresses, preference text, comments and anything a model wrote have no
 * shape they could be squeezed into, because free-form strings are not a shape
 * this file admits. `sanitiseProductEventMetadata` drops whatever the table
 * below does not describe, so a careless call site leaks nothing — it just
 * records less.
 *
 * Shared rather than server-only so the contract is one artefact: the runbook,
 * the tests and the recorder all read the same list.
 */

import { TRIP_ROLES } from "./roles.js";

/**
 * Named `<entity>.<verb>`, matching the activity trail's vocabulary in
 * `server/db.ts`. The two lists are deliberately separate — see the ADR — but
 * they read the same way so neither becomes the odd one out.
 */
export const PRODUCT_EVENTS = [
  "trip.created",
  "invite.sent",
  "invite.accepted",
  "preference.saved",
  "proposal.created",
  "vote.recorded",
  "referee.run",
  "dates.finalised",
  "accommodation.finalised",
  "trip.completed",
  "trip.cancelled",
] as const;

export type ProductEvent = (typeof PRODUCT_EVENTS)[number];

/** Value shapes telemetry may carry. Note the absence of "any string". */
export type ProductEventFieldSpec =
  | { kind: "boolean" }
  /** A non-negative integer. Counts of things, never amounts of money. */
  | { kind: "count" }
  | { kind: "enum"; values: readonly string[] };

const PROPOSAL_KINDS = [
  "date",
  "destination",
  "accommodation",
  "budget",
] as const;
const JOIN_ROUTES = ["link", "email"] as const;
const TRIP_PHASES = [
  "setup",
  "dates",
  "destination",
  "accommodation",
  "activities",
  "finalized",
] as const;

/**
 * Every field every event may carry. An event absent from a metric's needs
 * carries `{}` — the row's name, time, trip and actor are already enough for
 * most of `docs/runbooks/beta-metrics.md`, and metadata is only added where a
 * question cannot be answered without it.
 */
export const PRODUCT_EVENT_FIELDS: Record<
  ProductEvent,
  Readonly<Record<string, ProductEventFieldSpec>>
> = {
  /** `cloned` separates a trip started from scratch from a copy of another. */
  "trip.created": { cloned: { kind: "boolean" } },
  "invite.sent": { role: { kind: "enum", values: TRIP_ROLES } },
  /** `via` is what makes invite acceptance measurable at all — see the runbook. */
  "invite.accepted": {
    role: { kind: "enum", values: TRIP_ROLES },
    via: { kind: "enum", values: JOIN_ROUTES },
  },
  /**
   * How many of the four preference sections were filled in — a count, so the
   * requirements themselves stay where the group wrote them.
   */
  "preference.saved": { sections: { kind: "count" } },
  /**
   * Budget is one of these rather than an event of its own: it stopped being
   * an expense journal and became a proposal type like the other three (see
   * `server/routers/budget.ts`), so measuring it separately would have counted
   * the same act under two names. Never the amount and never the title.
   */
  "proposal.created": { kind: { kind: "enum", values: PROPOSAL_KINDS } },
  /** One event for both, because "did they participate" is the question. */
  "vote.recorded": {
    kind: { kind: "enum", values: PROPOSAL_KINDS },
    changed: { kind: "boolean" },
  },
  "referee.run": { phase: { kind: "enum", values: TRIP_PHASES } },
  "dates.finalised": {},
  "accommodation.finalised": {},
  "trip.completed": {},
  /**
   * The schema has no "archived" state; `cancelled` is the nearest thing and
   * is recorded as itself rather than relabelled into something the app does
   * not have.
   */
  "trip.cancelled": {},
};

export type ProductEventMetadata = Record<string, string | number | boolean>;

export interface SanitisedMetadata {
  /** Only the fields the contract describes, in the shape it describes them. */
  metadata: ProductEventMetadata;
  /** Keys that were dropped, for the caller to log. Empty in normal operation. */
  rejected: string[];
}

function accepts(spec: ProductEventFieldSpec, value: unknown): boolean {
  switch (spec.kind) {
    case "boolean":
      return typeof value === "boolean";
    case "count":
      return typeof value === "number" && Number.isInteger(value) && value >= 0;
    case "enum":
      return typeof value === "string" && spec.values.includes(value);
  }
}

/**
 * Reduces a call site's metadata to what the contract allows.
 *
 * Drops rather than throws: measurement must never be the reason a member's
 * action fails, and a dropped field is a gap in a chart, while a thrown error
 * is a broken trip.
 */
export function sanitiseProductEventMetadata(
  event: ProductEvent,
  metadata: Record<string, unknown> | undefined
): SanitisedMetadata {
  const allowed = PRODUCT_EVENT_FIELDS[event];
  const clean: ProductEventMetadata = {};
  const rejected: string[] = [];

  for (const [key, value] of Object.entries(metadata ?? {})) {
    const spec = allowed?.[key];
    if (spec && accepts(spec, value)) clean[key] = value as never;
    else rejected.push(key);
  }

  return { metadata: clean, rejected };
}

export function isProductEvent(value: string): value is ProductEvent {
  return (PRODUCT_EVENTS as readonly string[]).includes(value);
}
