/**
 * What a free account gets, and how to lift the limit.
 *
 * Shown when somebody with one trip on the go tries to start another. It is the
 * only paywall in the app: being invited to a trip is free and unlimited, so
 * nobody is ever blocked from joining what their friends are planning.
 *
 * **Buying happens in the native builds, not on the web.** Subscriptions go
 * through Apple's and Google's in-app purchase, which is mandatory for digital
 * goods and has no web equivalent — so the browser gets an explanation and the
 * apps get the store's own sheet.
 *
 * Nothing here grants anything. The sheet talks to the store, the store tells
 * RevenueCat, RevenueCat's webhook tells our server. Both the purchase and the
 * restore path therefore refetch `billing.status` rather than assuming they
 * worked: entitlement can be a second or two behind, and trusting the client's
 * word is the hole this whole design avoids.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { isNative } from "@/lib/session";
import {
  configurePurchases,
  currentOffering,
  purchase,
  restore,
} from "@/lib/purchases";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Sparkles } from "lucide-react";
import type { PurchasesOffering } from "@revenuecat/purchases-capacitor";

const INCLUDED = [
  "As many trips on the go as you like",
  "Everything else you already have",
  "People you invite never pay",
];

/**
 * Which store this build talks to.
 *
 * Capacitor exposes the platform on `window.Capacitor`. Anything that is not
 * iOS gets the Android key; the web never reaches here, because the query that
 * uses this is gated on `isNative()`.
 */
function platformName(): "ios" | "android" {
  const platform = (
    window as { Capacitor?: { getPlatform?: () => string } }
  ).Capacitor?.getPlatform?.();
  return platform === "ios" ? "ios" : "android";
}

export function PaywallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { user } = useAuth({});
  const { data: status } = trpc.billing.status.useQuery(undefined, {
    enabled: open,
  });

  // The publishable SDK key, served rather than baked in at build time so one
  // build can run against more than one RevenueCat project.
  const { data: sdkConfig } = trpc.billing.config.useQuery(
    { platform: platformName() },
    { enabled: open && isNative() }
  );

  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);

  useEffect(() => {
    const apiKey = sdkConfig?.apiKey;
    if (!open || !isNative() || !apiKey || !user) return;
    let cancelled = false;
    void (async () => {
      // Identified as the numeric user id, which is what the webhook maps back
      // to a row. An anonymous id would arrive as `$RCAnonymousID:…` with no
      // account to attach to, and the webhook would log it and move on.
      await configurePurchases(apiKey, user.id);
      const current = await currentOffering();
      if (!cancelled) setOffering(current);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sdkConfig?.apiKey, user]);

  async function settle(label: string) {
    await utils.billing.status.invalidate();
    toast.success(label);
    onOpenChange(false);
  }

  async function onBuy() {
    if (!offering) return;
    setBusy("buy");
    const result = await purchase(offering);
    setBusy(null);
    // Cancelling is a decision, not an error: leave the dialog open and say
    // nothing, so changing your mind back costs one tap.
    if (result.status === "cancelled") return;
    if (result.status === "failed") return void toast.error(result.message);
    await settle("Thank you — your subscription is active.");
  }

  async function onRestore() {
    setBusy("restore");
    const result = await restore();
    setBusy(null);
    if (result.status === "failed") return void toast.error(result.message);
    await settle("Restored.");
  }

  const price = offering?.availablePackages[0]?.product.priceString;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Plan more than one trip
          </DialogTitle>
          <DialogDescription>
            {status
              ? `You're organising ${status.activeTrips} ${
                  status.activeTrips === 1 ? "trip" : "trips"
                }, and a free account can organise ${status.freeLimit} at a time.`
              : "A free account organises one trip at a time."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ul className="space-y-2">
            {INCLUDED.map(line => (
              <li key={line} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-muted-foreground">
            Finishing a trip frees the slot — mark it complete and you can start
            the next one without subscribing.
          </p>

          {isNative() ? (
            <div className="space-y-2">
              <Button
                className="w-full"
                disabled={!offering || busy !== null}
                onClick={onBuy}
              >
                {busy === "buy"
                  ? "Opening…"
                  : offering
                    ? price
                      ? `Subscribe — ${price}`
                      : "Subscribe"
                    : "Nothing to buy just now"}
              </Button>
              {/* Apple requires a restore control and rejects for its absence.
                  It is also the fix for the commonest support mail an app like
                  this gets: "I paid and it says I haven't." */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={busy !== null}
                onClick={onRestore}
              >
                {busy === "restore" ? "Restoring…" : "Restore purchases"}
              </Button>
            </div>
          ) : (
            <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              Subscriptions are bought in the iOS and Android apps, through the
              App Store and Google Play. They aren't available on the web.
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={busy !== null}
            >
              Not now
            </Button>
            <Button variant="ghost" className="flex-1" asChild>
              <Link href="/terms">Terms</Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
