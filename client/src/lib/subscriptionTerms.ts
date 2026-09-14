/**
 * Wording for the renewal disclosure the stores require on a paywall.
 *
 * Its own file so it can be tested: `PaywallDialog` imports Radix and the
 * RevenueCat plugin, and there is no React test setup here.
 */

/**
 * "P1M" as "a month".
 *
 * Apple's 3.1.2 and Play's subscription policy both require the purchase screen
 * to state the length of the subscription and that it renews — a price on a
 * button is not a disclosure, and it is a documented rejection. RevenueCat
 * gives the period as an ISO 8601 duration, so the wording is derived from the
 * product rather than written here: a paywall that says "a month" about a
 * yearly product is worse than one that says nothing.
 *
 * Null for anything unrecognised, and the caller then says "each period" rather
 * than inventing one.
 */
export function periodWording(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const match = /^P(\d+)([DWMY])$/.exec(iso);
  if (!match) return null;
  const count = Number(match[1]);
  const units: Record<string, string> = {
    D: "day",
    W: "week",
    M: "month",
    Y: "year",
  };
  const unit = units[match[2]];
  if (!unit) return null;
  return count === 1 ? `a ${unit}` : `${count} ${unit}s`;
}
