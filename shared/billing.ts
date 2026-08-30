/**
 * What a free account gets, and how to tell whether somebody is subscribed.
 *
 * Both sides import this: the client to decide when to show the paywall, the
 * server to enforce it. **The server is what enforces it** — a client that
 * hides the button has still been told the limit by something it can edit.
 *
 * Subscriptions are sold through Apple's and Google's in-app purchase, which is
 * mandatory for digital goods. Nothing here touches money; it reads the state
 * the stores report through RevenueCat's webhook.
 */

/**
 * How many trips a free account may **organise** at once.
 *
 * Organise, not be a member of: being invited is always free and unlimited. A
 * paying organiser must never drag their friends into paying, both because it
 * would stall the group and because the person who chose to start the trip is
 * the one who chose to spend anything.
 */
export const FREE_ACTIVE_TRIP_LIMIT = 1;

/**
 * Trip states that count against the limit.
 *
 * A finished or abandoned trip does not: the cap is on how much you are
 * planning at once, not on how much you have ever planned, and a free account
 * that came back a year later to plan another holiday should not have to delete
 * their memories of the first one.
 */
export const ACTIVE_TRIP_STATUSES = ["planning", "active"] as const;

/** What the stores report, narrowed to what this app acts on. */
export type SubscriptionStatus =
  | "active"
  | "in_grace_period"
  | "billing_issue"
  | "expired"
  | "none";

/**
 * Whether this subscription entitles its owner right now.
 *
 * A billing issue still entitles: the store is retrying a card that will
 * probably work, and locking somebody out of a trip they are mid-way through
 * planning over a temporary decline is worse for them and for us than a few
 * days of unpaid access. `expired` is the state that stops entitling.
 */
export function isEntitled(
  subscription:
    | { status: SubscriptionStatus; expiresAt?: Date | string | null }
    | null
    | undefined,
  now: number = Date.now()
): boolean {
  if (!subscription) return false;
  if (subscription.status === "expired" || subscription.status === "none")
    return false;
  // Trust the clock over the label where both exist: a webhook we never
  // received cannot keep somebody entitled forever.
  if (subscription.expiresAt) {
    const until = new Date(subscription.expiresAt).getTime();
    if (!Number.isNaN(until) && until < now) return false;
  }
  return true;
}

/** Shown when the gate refuses. The client watches for it to open the paywall. */
export const TRIP_LIMIT_ERR_MSG =
  "You're already organising a trip (10003). Subscribe to plan more than one at a time.";
