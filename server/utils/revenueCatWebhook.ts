/**
 * RevenueCat's webhook: the only thing in this codebase that records a purchase.
 *
 * A purchase is a fact the stores own. The client asks a store to sell it
 * something; the store tells RevenueCat; RevenueCat posts here. No tRPC
 * procedure writes `subscriptions`, and none should — a client that could say
 * "I bought it" could grant itself the product.
 *
 * Registered as a plain Express route in `_core/app.ts` because RevenueCat
 * posts JSON to a URL and knows nothing about tRPC.
 */
import crypto from "crypto";
import type { Request, Response } from "express";

import { config } from "../_core/env.js";
import { logger } from "../_core/logger.js";
import * as db from "../db.js";
import type { Subscription, InsertSubscription } from "../../drizzle/schema.js";

const log = logger.child({ scope: "billing" });

/**
 * RevenueCat's event types, mapped to what this app stores.
 *
 * Only the ones that change entitlement are listed; anything else is
 * acknowledged and ignored, which is deliberate. An unknown event type is not
 * an error — RevenueCat adds them — and answering 4xx would make it retry
 * forever.
 */
const STATUS_BY_EVENT: Record<string, Subscription["status"] | undefined> = {
  INITIAL_PURCHASE: "active",
  RENEWAL: "active",
  UNCANCELLATION: "active",
  PRODUCT_CHANGE: "active",
  NON_RENEWING_PURCHASE: "active",
  // Still entitled: the store is retrying a card that will probably work, and
  // locking somebody out of a half-planned trip over a temporary decline is
  // worse for them and for us than a few days of unpaid access.
  BILLING_ISSUE: "billing_issue",
  SUBSCRIPTION_PAUSED: "in_grace_period",
  // `CANCELLATION` means "will not renew", not "access ends now" — access runs
  // to `expiration_at_ms`, which is why it does not map to `expired` here.
  EXPIRATION: "expired",
};

const STORE_BY_NAME: Record<string, Subscription["store"] | undefined> = {
  APP_STORE: "app_store",
  MAC_APP_STORE: "app_store",
  PLAY_STORE: "play_store",
  PROMOTIONAL: "promotional",
  RC_BILLING: "promotional",
};

/**
 * Constant-time comparison of the shared secret.
 *
 * `===` on a secret leaks its length and its matching prefix through timing.
 * The cost of doing this properly is a few lines.
 */
function secretMatches(header: string | undefined, expected: string): boolean {
  if (!header || !expected) return false;
  const given = header.startsWith("Bearer ") ? header.slice(7) : header;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** RevenueCat sends epoch milliseconds, or null. */
function atMs(value: unknown): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value);
}

export async function handleRevenueCatWebhook(req: Request, res: Response) {
  // A webhook that cannot be verified must not be acted on. 401 rather than
  // silence, so a misconfigured secret shows up in RevenueCat's own delivery
  // log rather than looking like everything is fine.
  if (!secretMatches(req.get("authorization"), config.billing.webhookSecret)) {
    log.warn("rejected a webhook with a bad or missing secret");
    return res.status(401).json({ error: "unauthorized" });
  }

  const event = (req.body as { event?: Record<string, unknown> })?.event;
  if (!event || typeof event !== "object") {
    return res.status(400).json({ error: "no event" });
  }

  const type = String(event.type ?? "");
  const status = STATUS_BY_EVENT[type];

  // Acknowledged and ignored. An unknown type is not a failure — RevenueCat
  // adds them, and a 4xx would make it retry this one forever.
  if (!status) {
    log.debug("ignoring a webhook event this app does not act on", { type });
    return res.json({ ok: true, ignored: type });
  }

  /**
   * `app_user_id` is whatever the client identified itself as. This app logs in
   * to RevenueCat with the numeric user id, so anything else — an anonymous
   * `$RCAnonymousID:…` from a purchase made before sign-in — has no account to
   * attach to. Acknowledged rather than retried: it will never resolve.
   */
  const appUserId = String(event.app_user_id ?? "");
  const userId = Number(appUserId);
  if (!Number.isInteger(userId) || userId <= 0) {
    log.warn("webhook for an app_user_id that is not an account", {
      type,
      appUserId,
    });
    return res.json({ ok: true, ignored: "unmapped app_user_id" });
  }

  const store = STORE_BY_NAME[String(event.store ?? "")] ?? "promotional";
  const record: InsertSubscription = {
    userId,
    revenueCatId: appUserId.slice(0, 128),
    productId: String(event.product_id ?? "unknown").slice(0, 128),
    store,
    status,
    expiresAt: atMs(event.expiration_at_ms),
    // Present on CANCELLATION and on any event for a subscription that is set
    // not to renew. It does not end access on its own.
    cancelledAt: atMs(
      event.cancellation_at_ms ?? event.unsubscribe_detected_at_ms
    ),
  };

  await db.upsertSubscription(record);

  log.info("subscription updated", {
    userId,
    type,
    status,
    store,
    productId: record.productId,
  });

  return res.json({ ok: true });
}
