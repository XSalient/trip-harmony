/**
 * Budget arithmetic, in one place because both sides need it.
 *
 * A budget proposal states an amount and a *scope* saying what that amount
 * means — a total for the trip, a figure per head, per adult, or per family.
 * Two proposals written in different scopes are only comparable once both are
 * expressed as the same thing, so everything here normalises to a trip total
 * and divides back down from there.
 *
 * The server computes it, the screen shows it and the referee reasons about it.
 * A second implementation on the client is how those three end up disagreeing
 * about what a group owes.
 */

export const BUDGET_SCOPES = [
  "trip_total",
  "per_person",
  "per_adult",
  "per_group",
] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];

export const BUDGET_SCOPE_LABELS: Record<BudgetScope, string> = {
  trip_total: "total for the trip",
  per_person: "per person",
  per_adult: "per adult",
  per_group: "per family",
};

/**
 * What a trip is being charged for.
 *
 * `groups` counts voting units — a group, or an ungrouped member — because a
 * per-family figure is charged once to each of them.
 */
export type Headcount = {
  adults: number;
  children: number;
  pets: number;
  groups: number;
};

/** A share of one group. `pets` is absent on purpose: a pet is never charged. */
export type GroupHeads = { adults: number; children: number };

/**
 * Adults and children. **Pets are never a chargeable head** — not here, not in
 * a per-person figure, not in a headcount summary. A dog does not need a bed
 * or a plane seat, and dividing by it makes every per-person number quietly
 * wrong in a way no screen shows.
 */
export function chargeableHeads(h: { adults: number; children: number }) {
  return h.adults + h.children;
}

/**
 * Any proposal, whatever its scope, as one comparable trip total.
 *
 * Returns 0 rather than NaN or Infinity when the multiplier is zero. A brand
 * new trip has no attendees yet, and `NaN` there renders the whole section as
 * "NaN" — plausible-looking code, completely broken screen.
 */
export function tripTotalOf(
  amount: number,
  scope: BudgetScope,
  h: Headcount
): number {
  if (!Number.isFinite(amount)) return 0;
  switch (scope) {
    case "trip_total":
      return amount;
    case "per_person":
      return amount * chargeableHeads(h);
    case "per_adult":
      return amount * h.adults;
    case "per_group":
      return amount * h.groups;
  }
}

/**
 * What one group pays under a proposal.
 *
 * `per_group` is flat — that is what "per family" means, and a family of five
 * pays it just as a couple does. Every other scope apportions the trip total by
 * chargeable heads, so the shares across all groups sum back to the total.
 */
export function groupShareOf(
  amount: number,
  scope: BudgetScope,
  h: Headcount,
  group: GroupHeads
): number {
  if (!Number.isFinite(amount)) return 0;
  if (scope === "per_group") return amount;
  const total = tripTotalOf(amount, scope, h);
  const heads = chargeableHeads(h);
  if (heads <= 0) return 0;
  return (total * chargeableHeads(group)) / heads;
}

/**
 * The trip total divided by chargeable heads — the "and what is that each?"
 * figure every budget screen wants beside the total.
 */
export function perPersonOf(tripTotal: number, h: Headcount): number {
  const heads = chargeableHeads(h);
  return heads > 0 ? tripTotal / heads : 0;
}

/** The trip total divided by voting units. Zero groups means zero, not Infinity. */
export function perGroupOf(tripTotal: number, h: Headcount): number {
  return h.groups > 0 ? tripTotal / h.groups : 0;
}

/**
 * How a proposal's amount reads on a card: "1,400 per family".
 *
 * Currency is placed as a code rather than a symbol because the trip carries an
 * ISO code and the app supports more than one; a hardcoded `$` was the bug in
 * the budget alerts this section replaced.
 */
export function describeAmount(
  amount: number,
  scope: BudgetScope,
  currency: string
): string {
  const figure = amount.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });
  return `${currency} ${figure} ${BUDGET_SCOPE_LABELS[scope]}`;
}
