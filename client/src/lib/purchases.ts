/**
 * Buying a subscription, which only the native builds can do.
 *
 * Digital goods must be sold through Apple's and Google's in-app purchase, and
 * there is no web equivalent — so every function here is a no-op on the web and
 * `PaywallDialog` shows an explanation instead of a button.
 *
 * **Nothing here grants anything.** The purchase sheet talks to the store, the
 * store tells RevenueCat, and RevenueCat's webhook tells our server. This file
 * cannot make somebody a subscriber, and the server exposes no procedure that
 * could — see `server/routers/billing.ts`.
 */
import {
  LOG_LEVEL,
  Purchases,
  type PurchasesOffering,
} from "@revenuecat/purchases-capacitor";

import { isNative } from "./session";

/** Configured once per app launch; calling twice is wasteful, not harmful. */
let configuredFor: number | null = null;

/**
 * Identify this install to RevenueCat as the signed-in account.
 *
 * The `appUserID` is the numeric user id, and the webhook maps it straight back
 * to a row — an anonymous id would arrive as `$RCAnonymousID:…` with no account
 * to attach to, which the webhook logs and ignores. So this must run *after*
 * sign-in, not at launch.
 */
export async function configurePurchases(
  apiKey: string,
  userId: number
): Promise<void> {
  if (!isNative() || configuredFor === userId) return;
  await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR });
  await Purchases.configure({ apiKey, appUserID: String(userId) });
  configuredFor = userId;
}

/**
 * The subscription on offer, or null if the store has nothing to sell.
 *
 * Null is a normal answer, not a failure: a build whose products are still in
 * review, or a sandbox account in the wrong region, both land here. The dialog
 * says so rather than showing a price it does not have.
 */
export async function currentOffering(): Promise<PurchasesOffering | null> {
  if (!isNative()) return null;
  try {
    const { current } = await Purchases.getOfferings();
    return current ?? null;
  } catch {
    return null;
  }
}

export type PurchaseOutcome =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "failed"; message: string };

/**
 * Open the store's purchase sheet.
 *
 * A cancellation is a decision, not an error — somebody who changes their mind
 * should get the dialog back, not a red toast telling them something went
 * wrong.
 *
 * Success here means the *store* accepted the payment. Entitlement still
 * arrives by webhook, so the caller refetches `billing.status` rather than
 * assuming: the two can be a second or two apart, and trusting the client's
 * word would be the hole this whole design avoids.
 */
export async function purchase(
  offering: PurchasesOffering
): Promise<PurchaseOutcome> {
  if (!isNative()) return { status: "failed", message: "Not available here." };
  const pkg = offering.availablePackages[0];
  if (!pkg) return { status: "failed", message: "Nothing to buy just now." };

  try {
    await Purchases.purchasePackage({ aPackage: pkg });
    return { status: "purchased" };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "userCancelled" in error &&
      (error as { userCancelled?: boolean }).userCancelled
    ) {
      return { status: "cancelled" };
    }
    return {
      status: "failed",
      message:
        error instanceof Error
          ? error.message
          : "The purchase didn't complete.",
    };
  }
}

/**
 * Restore a subscription bought on another device, or before a reinstall.
 *
 * **Apple requires this and rejects for its absence.** It is also the fix for
 * the commonest support mail an app like this gets: "I paid and it says I
 * haven't."
 */
export async function restore(): Promise<PurchaseOutcome> {
  if (!isNative()) return { status: "failed", message: "Not available here." };
  try {
    await Purchases.restorePurchases();
    return { status: "purchased" };
  } catch (error) {
    return {
      status: "failed",
      message:
        error instanceof Error ? error.message : "Couldn't restore purchases.",
    };
  }
}
