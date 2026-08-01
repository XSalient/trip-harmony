import { useEffect, useState } from "react";
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
import { Mail, CheckCircle, Fingerprint } from "lucide-react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";

/** Password is optional here because the same form sends a magic link or signs in. */
const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().optional(),
});

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignInForm = z.infer<typeof signInSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  defaultMode?: "signin" | "register";
  /** Opens with the password field already showing, e.g. from an expired magic link. */
  startWithPassword?: boolean;
}

export function AuthDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultMode = "signin",
  startWithPassword = false,
}: AuthDialogProps) {
  const [mode, setMode] = useState<"signin" | "register">(defaultMode);
  const [serverError, setServerError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [magicDebugUrl, setMagicDebugUrl] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(startWithPassword);
  const utils = trpc.useUtils();

  const { data: capabilities } = trpc.auth.capabilities.useQuery();
  // Assume magic links work until told otherwise, so the dialog doesn't flicker on open.
  const magicLinkEnabled = capabilities?.magicLink ?? true;
  const magicLinkReliable = capabilities?.magicLinkReliable ?? true;

  // Only force the password field when no link can be sent at all. Passwordless stays the
  // primary action otherwise — an unreliable link is still worth offering first, because the
  // password route is one click away and a failed send reveals it automatically.
  useEffect(() => {
    if (!magicLinkEnabled) setShowPassword(true);
  }, [magicLinkEnabled]);

  const signInForm = useForm<SignInForm>({
    resolver: zodResolver(signInSchema),
  });
  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      onSuccess();
    },
    onError: err => setServerError(err.message),
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      onSuccess();
    },
    onError: err => setServerError(err.message),
  });

  const magicMutation = trpc.auth.requestMagicLink.useMutation({
    onSuccess: data => {
      setServerError(null);
      setMagicSent(true);
      if (data.debugUrl) setMagicDebugUrl(data.debugUrl);
    },
    onError: err => {
      // A link that cannot be sent must not be a dead end: surface the password route at once.
      setServerError(err.message);
      setShowPassword(true);
    },
  });

  const passkeyStartMutation = trpc.passkeys.startAuthentication.useMutation();
  const passkeyFinishMutation =
    trpc.passkeys.finishAuthentication.useMutation();
  const [passkeyPending, setPasskeyPending] = useState(false);
  // No point offering a passkey the browser cannot produce.
  const passkeysSupported = browserSupportsWebAuthn();

  /**
   * Usernameless by design: the server sends no credential list, so the browser
   * offers whichever passkey it holds for this site and the user never types an
   * address.
   */
  async function signInWithPasskey() {
    setServerError(null);
    setPasskeyPending(true);
    try {
      const { challengeId, options } = await passkeyStartMutation.mutateAsync();
      const response = await startAuthentication({ optionsJSON: options });
      await passkeyFinishMutation.mutateAsync({ challengeId, response });
      await utils.auth.me.invalidate();
      onSuccess();
    } catch (error) {
      // Dismissing the system prompt is a choice, not a failure to report.
      if (
        error instanceof Error &&
        (error.name === "NotAllowedError" || error.name === "AbortError")
      ) {
        return;
      }
      setServerError(
        error instanceof Error
          ? error.message
          : "Couldn't sign in with a passkey."
      );
    } finally {
      setPasskeyPending(false);
    }
  }

  const isPending =
    loginMutation.isPending ||
    registerMutation.isPending ||
    magicMutation.isPending ||
    passkeyPending;

  function switchMode(next: "signin" | "register") {
    setMode(next);
    setServerError(null);
    setMagicSent(false);
    setMagicDebugUrl(null);
    signInForm.reset();
    registerForm.reset();
  }

  function revealPassword() {
    setServerError(null);
    setMagicSent(false);
    setShowPassword(true);
  }

  function onSignInSubmit(data: SignInForm) {
    setServerError(null);
    if (showPassword) {
      if (!data.password) {
        signInForm.setError("password", { message: "Password is required" });
        return;
      }
      loginMutation.mutate({ email: data.email, password: data.password });
      return;
    }
    magicMutation.mutate({ email: data.email });
  }

  function onRegister(data: RegisterForm) {
    setServerError(null);
    registerMutation.mutate(data);
  }

  const title =
    mode === "register"
      ? "Create your account"
      : magicSent
        ? "Check your inbox"
        : "Sign in";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">
            {title}
          </DialogTitle>
        </DialogHeader>

        {mode === "signin" && magicSent && (
          <div className="space-y-4 mt-2 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-sm text-muted-foreground">
              We've sent a sign-in link to{" "}
              <strong>{signInForm.getValues("email")}</strong>. Click it to log
              in — it expires in 15 minutes.
            </p>
            {magicDebugUrl && (
              <div className="text-left bg-muted rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Dev mode — link:
                </p>
                <a
                  href={magicDebugUrl}
                  className="text-xs text-primary break-all hover:underline"
                >
                  {magicDebugUrl}
                </a>
              </div>
            )}
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                Email taking a while to arrive?
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={revealPassword}
              >
                Log in with your password instead
              </Button>
            </div>
            <button
              type="button"
              className="text-sm text-primary font-medium hover:underline"
              onClick={() => {
                setMagicSent(false);
                setMagicDebugUrl(null);
              }}
            >
              Send again
            </button>
          </div>
        )}

        {mode === "signin" && !magicSent && (
          <form
            onSubmit={signInForm.handleSubmit(onSignInSubmit)}
            className="space-y-4 mt-2"
          >
            {!showPassword && (
              <p className="text-sm text-muted-foreground text-center">
                Enter your email and we'll send you a sign-in link — no password
                needed.
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="signin-email">Email</Label>
              <Input
                id="signin-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                {...signInForm.register("email")}
              />
              {signInForm.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {signInForm.formState.errors.email.message}
                </p>
              )}
            </div>

            {showPassword && (
              <div className="space-y-1.5">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...signInForm.register("password")}
                />
                {signInForm.formState.errors.password && (
                  <p className="text-xs text-destructive">
                    {signInForm.formState.errors.password.message}
                  </p>
                )}
              </div>
            )}

            {serverError && (
              <p className="text-sm text-destructive text-center">
                {serverError}
              </p>
            )}

            <Button type="submit" className="w-full gap-2" disabled={isPending}>
              {showPassword ? (
                isPending ? (
                  "Signing in…"
                ) : (
                  "Sign In"
                )
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  {isPending ? "Sending…" : "Send Magic Link"}
                </>
              )}
            </Button>

            {magicLinkEnabled && showPassword && (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={isPending}
                onClick={() => {
                  setServerError(null);
                  setShowPassword(false);
                }}
              >
                <Mail className="h-4 w-4" /> Email me a sign-in link instead
              </Button>
            )}

            {passkeysSupported && (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2"
                disabled={isPending}
                onClick={signInWithPasskey}
              >
                <Fingerprint className="h-4 w-4" />
                {passkeyPending ? "Waiting for your device…" : "Use a passkey"}
              </Button>
            )}

            {/* Weight the password route by how likely the link is to land, without ever
                displacing passwordless as the primary action. */}
            {!showPassword &&
              (magicLinkReliable ? (
                <p className="text-center text-sm">
                  <button
                    type="button"
                    className="text-primary font-medium hover:underline"
                    onClick={revealPassword}
                  >
                    Sign in with password
                  </button>
                </p>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={isPending}
                  onClick={revealPassword}
                >
                  Sign in with password
                </Button>
              ))}

            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => switchMode("register")}
              >
                Sign up
              </button>
            </p>
          </form>
        )}

        {mode === "register" && (
          <form
            onSubmit={registerForm.handleSubmit(onRegister)}
            className="space-y-4 mt-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="reg-name">Name</Label>
              <Input
                id="reg-name"
                type="text"
                placeholder="Your name"
                autoComplete="name"
                {...registerForm.register("name")}
              />
              {registerForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {registerForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Email</Label>
              <Input
                id="reg-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                {...registerForm.register("email")}
              />
              {registerForm.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {registerForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-password">Password</Label>
              <Input
                id="reg-password"
                type="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                {...registerForm.register("password")}
              />
              {registerForm.formState.errors.password && (
                <p className="text-xs text-destructive">
                  {registerForm.formState.errors.password.message}
                </p>
              )}
            </div>
            {serverError && (
              <p className="text-sm text-destructive text-center">
                {serverError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Creating account…" : "Create Account"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                className="text-primary font-medium hover:underline"
                onClick={() => switchMode("signin")}
              >
                Sign in
              </button>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
