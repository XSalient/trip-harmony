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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle } from "lucide-react";

const schema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

interface SetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SetPasswordDialog({
  open,
  onOpenChange,
}: SetPasswordDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const utils = trpc.useUtils();

  const { data } = trpc.auth.hasPassword.useQuery(undefined, { enabled: open });
  const hasPassword = data?.hasPassword ?? false;

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = trpc.auth.setPassword.useMutation({
    onSuccess: async () => {
      setDone(true);
      await utils.auth.hasPassword.invalidate();
    },
    onError: err => setServerError(err.message),
  });

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setServerError(null);
      setDone(false);
      form.reset();
    }
  }

  function onSubmit(values: FormValues) {
    setServerError(null);
    mutation.mutate(values);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">
            {hasPassword ? "Change your password" : "Set a password"}
          </DialogTitle>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 mt-2 text-center">
            <CheckCircle className="h-12 w-12 text-success-strong mx-auto" />
            <p className="text-sm text-muted-foreground">
              Your password is set. You can now sign in with your email and
              password on any device.
            </p>
            <Button className="w-full" onClick={() => close(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4 mt-2"
          >
            {!hasPassword && (
              <p className="text-sm text-muted-foreground text-center">
                Your account was created with a sign-in link and has no password
                yet. Set one so you can always sign in, even on a new device.
              </p>
            )}
            {hasPassword && (
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  {...form.register("currentPassword")}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                {...form.register("newPassword")}
              />
              {form.formState.errors.newPassword && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.newPassword.message}
                </p>
              )}
            </div>
            {serverError && (
              <p className="text-sm text-destructive text-center">
                {serverError}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? "Saving…"
                : hasPassword
                  ? "Change Password"
                  : "Set Password"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
