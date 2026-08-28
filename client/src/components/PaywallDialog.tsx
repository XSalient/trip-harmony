/**
 * What a free account gets, and how to lift the limit.
 *
 * Shown when somebody with one trip on the go tries to start another. It is the
 * only paywall in the app: being invited to a trip is free and unlimited, so
 * nobody is ever blocked from joining what their friends are planning.
 *
 * **Buying happens in the native app, not here.** Subscriptions go through
 * Apple's and Google's in-app purchase, which is mandatory for digital goods
 * and has no web equivalent — so on the web this explains the limit and points
 * at the app, and in the Capacitor build the same dialog will open the store
 * sheet. The `canPurchase` check below is the seam where that lands.
 */
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Sparkles } from "lucide-react";

/**
 * Whether this build can open a store purchase sheet.
 *
 * False on the web, where there is no in-app purchase to open. Capacitor sets
 * `window.Capacitor` in the native builds, which is what this will read once
 * the wrap lands; until then it is honestly false everywhere, and the dialog
 * says so rather than showing a button that cannot work.
 */
function canPurchase(): boolean {
  return typeof window !== "undefined" && "Capacitor" in window;
}

const INCLUDED = [
  "As many trips on the go as you like",
  "Everything else you already have",
  "People you invite never pay",
];

export function PaywallDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: status } = trpc.billing.status.useQuery(undefined, {
    enabled: open,
  });

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

          {canPurchase() ? (
            <Button className="w-full" disabled>
              {/* Wired to RevenueCat when the Capacitor wrap lands; a button
                  that looks live and does nothing is worse than one that says
                  what it is waiting for. */}
              Subscriptions are coming soon
            </Button>
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
