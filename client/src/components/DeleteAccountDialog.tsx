/**
 * Deleting your account, and being told what that will cost before you do.
 *
 * Apple requires this to be reachable in-app, but the requirement is only the
 * reason it exists — the shape is set by what the operation actually does. It
 * cannot be undone, and it reaches other people's trips, so the dialog says
 * which trips will be handed on and which will be deleted *before* the button
 * is live, rather than reporting it afterwards.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

const schema = z.object({
  confirm: z.string(),
  password: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
}: DeleteAccountDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  // Only accounts with a password are asked for one; magic-link accounts have
  // none to give, and the server applies the same rule.
  const { data: passwordData } = trpc.auth.hasPassword.useQuery(undefined, {
    enabled: open,
  });
  const hasPassword = passwordData?.hasPassword ?? false;

  // What deleting will do to trips other people are in. Read before the fact so
  // the warning is specific — "2 trips will be deleted" is a different decision
  // from "your trips will be handed to someone else".
  const { data: impact } = trpc.auth.deletionImpact.useQuery(undefined, {
    enabled: open,
  });

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const confirm = form.watch("confirm");
  const password = form.watch("password");

  const mutation = trpc.auth.deleteAccount.useMutation({
    // No toast and no cache invalidation: the account this session belongs to
    // no longer exists, so a full reload to the landing page is the only
    // honest next state. Anything softer leaves React Query refetching as a
    // user the server will refuse.
    onSuccess: () => window.location.replace("/"),
    onError: err => setServerError(err.message),
  });

  function close(next: boolean) {
    if (mutation.isPending) return;
    if (!next) {
      form.reset();
      setServerError(null);
    }
    onOpenChange(next);
  }

  const ready = confirm === "DELETE" && (!hasPassword || Boolean(password));

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete your account
          </DialogTitle>
          <DialogDescription>
            This cannot be undone. Your name, email and sign-in details are
            erased immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-2">
            {impact ? (
              <>
                {impact.tripsHandedOver > 0 && (
                  <p>
                    <strong>{impact.tripsHandedOver}</strong>{" "}
                    {impact.tripsHandedOver === 1 ? "trip" : "trips"} you
                    organise will be handed to another member, so the rest of
                    the group keeps their planning.
                  </p>
                )}
                {impact.tripsDeleted > 0 && (
                  <p>
                    <strong>{impact.tripsDeleted}</strong>{" "}
                    {impact.tripsDeleted === 1 ? "trip" : "trips"} with nobody
                    else in {impact.tripsDeleted === 1 ? "it" : "them"} will be
                    deleted.
                  </p>
                )}
                <p className="text-muted-foreground">
                  Your votes are removed. Proposals you added stay with the
                  trip, shown as from a former member.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">
                Checking what this will affect…
              </p>
            )}
          </div>

          <form
            onSubmit={form.handleSubmit(values => {
              setServerError(null);
              mutation.mutate({
                confirm: "DELETE",
                password: values.password || undefined,
              });
            })}
            className="space-y-4"
          >
            {hasPassword && (
              <div className="space-y-1.5">
                <Label htmlFor="delete-password">Your password</Label>
                <Input
                  id="delete-password"
                  type="password"
                  autoComplete="current-password"
                  {...form.register("password")}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="delete-confirm">
                Type <span className="font-mono font-semibold">DELETE</span> to
                confirm
              </Label>
              <Input
                id="delete-confirm"
                autoComplete="off"
                autoCapitalize="characters"
                {...form.register("confirm")}
              />
            </div>

            {serverError && (
              <p className="text-sm text-destructive">{serverError}</p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => close(false)}
                disabled={mutation.isPending}
              >
                Keep my account
              </Button>
              <Button
                type="submit"
                variant="destructive"
                className="flex-1"
                disabled={!ready || mutation.isPending}
              >
                {mutation.isPending ? "Deleting…" : "Delete for good"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
