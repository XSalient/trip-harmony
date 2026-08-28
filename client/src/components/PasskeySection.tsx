/**
 * Passkey management for the profile page: list, add, remove.
 *
 * Hidden entirely on browsers without WebAuthn rather than shown broken —
 * there is nothing a user can do about an unsupported browser.
 */
import { useState } from "react";
import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Fingerprint, Plus, Trash2, ShieldCheck } from "lucide-react";

/** The user cancelled the browser prompt — not an error worth shouting about. */
function isCancellation(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  );
}

export function PasskeySection() {
  const supported = browserSupportsWebAuthn();
  const [busy, setBusy] = useState(false);
  const utils = trpc.useUtils();

  const { data: passkeys, isLoading } = trpc.passkeys.list.useQuery(undefined, {
    enabled: supported,
  });
  const startMutation = trpc.passkeys.startRegistration.useMutation();
  const finishMutation = trpc.passkeys.finishRegistration.useMutation();
  const removeMutation = trpc.passkeys.remove.useMutation({
    onSuccess: async () => {
      await utils.passkeys.list.invalidate();
      toast.success("Passkey removed");
    },
    onError: err => toast.error(err.message),
  });

  async function addPasskey() {
    setBusy(true);
    try {
      const { challengeId, options } = await startMutation.mutateAsync();
      const response = await startRegistration({ optionsJSON: options });
      await finishMutation.mutateAsync({ challengeId, response });
      await utils.passkeys.list.invalidate();
      toast.success("Passkey added — you can now sign in with your device");
    } catch (error) {
      if (isCancellation(error)) return;
      // A passkey for this account already exists on this device: the browser
      // refuses rather than creating a duplicate, which is the right outcome.
      if (error instanceof Error && error.name === "InvalidStateError") {
        toast.info("This device already has a passkey for your account");
        return;
      }
      toast.error(
        error instanceof Error ? error.message : "Couldn't add that passkey"
      );
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <Card className="rounded-2xl border-0 bg-card shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Fingerprint className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">Passkeys</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Sign in with Face ID, Touch ID, or your device PIN — no password
              to remember or type.
            </p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-12 rounded-lg" />
        ) : passkeys && passkeys.length > 0 ? (
          <ul className="space-y-2">
            {passkeys.map(passkey => (
              <li
                key={passkey.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2"
              >
                <ShieldCheck className="h-4 w-4 text-success-strong shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {passkey.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {passkey.synced
                      ? "Synced across your devices"
                      : "This device only"}
                    {passkey.lastUsedAt
                      ? ` · last used ${new Date(passkey.lastUsedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${passkey.label}`}
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate({ id: passkey.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No passkeys yet. Add one and this device becomes your sign-in.
          </p>
        )}

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={addPasskey}
          disabled={busy}
        >
          <Plus className="h-4 w-4" />
          {busy ? "Waiting for your device…" : "Add a passkey"}
        </Button>
      </CardContent>
    </Card>
  );
}
