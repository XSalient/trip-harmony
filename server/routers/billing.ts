/**
 * What this account is allowed, and what it has bought.
 *
 * Subscriptions are sold through Apple's and Google's in-app purchase, which is
 * mandatory for digital goods. **No money moves through this server and no card
 * details reach it.** RevenueCat sits in front of both stores; its webhook —
 * registered in `_core/app.ts`, not here, because RevenueCat posts plain JSON
 * rather than speaking tRPC — is the only thing that writes `subscriptions`.
 *
 * So there is no `purchase` procedure and there should never be one. A client
 * that could tell this server it had bought something could grant itself the
 * product. What the client does is ask the store to sell it something, and the
 * store tells us.
 */
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc.js";
import { config } from "../_core/env.js";
import * as db from "../db.js";
import {
  FREE_ACTIVE_TRIP_LIMIT,
  isEntitled,
  type SubscriptionStatus,
} from "../../shared/billing.js";

export const billingRouter = router({
  /**
   * What the caller is allowed right now, and why.
   *
   * One query rather than several, because every consumer needs the whole
   * picture: the paywall needs to know they are over the limit, the profile
   * screen needs to know what they own, and a "New trip" button needs to know
   * whether to open the paywall before or after the form.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const subscription = await db.getSubscription(ctx.user.id);
    const entitled = isEntitled(subscription);
    const activeTrips = await db.countActiveOrganisedTrips(ctx.user.id);

    // Two different reasons the gate lets everybody through, and they are worth
    // distinguishing to whoever is looking at a deployment: one is a decision,
    // the other is a deployment that has not finished being set up.
    const enforced = config.billing.enabled && config.billing.isConfigured;

    return {
      /** False means this deployment is not charging anybody. */
      enforced,
      entitled: entitled || !enforced,
      activeTrips,
      freeLimit: FREE_ACTIVE_TRIP_LIMIT,
      /** True when creating one more trip would be refused. */
      atLimit: enforced && !entitled && activeTrips >= FREE_ACTIVE_TRIP_LIMIT,
      subscription: subscription
        ? {
            status: subscription.status as SubscriptionStatus,
            productId: subscription.productId,
            store: subscription.store,
            expiresAt: subscription.expiresAt,
            cancelledAt: subscription.cancelledAt,
          }
        : null,
    };
  }),

  /**
   * The public SDK key for a platform, so the client can talk to RevenueCat.
   *
   * Safe to hand out — these are the publishable keys, and they identify the
   * app rather than authorising anything. Served rather than inlined at build
   * time so one build can run against more than one project, which is what
   * `VITE_` prefixing would have prevented.
   */
  config: protectedProcedure
    .input(z.object({ platform: z.enum(["ios", "android"]) }))
    .query(({ input }) => ({
      apiKey:
        (input.platform === "ios"
          ? process.env.VITE_REVENUECAT_IOS_KEY
          : process.env.VITE_REVENUECAT_ANDROID_KEY) || null,
    })),
});
