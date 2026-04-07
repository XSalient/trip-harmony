import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TRPCClientError } from "@trpc/client";
import { Mail, CheckCircle } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const magicSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;
type MagicForm = z.infer<typeof magicSchema>;

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AuthDialog({ open, onOpenChange, onSuccess }: AuthDialogProps) {
  const [mode, setMode] = useState<"login" | "register" | "magic">("login");
  const [serverError, setServerError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [magicDebugUrl, setMagicDebugUrl] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });
  const magicForm = useForm<MagicForm>({ resolver: zodResolver(magicSchema) });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); onSuccess(); },
    onError: (err) => setServerError(err.message),
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => { await utils.auth.me.invalidate(); onSuccess(); },
    onError: (err) => setServerError(err.message),
  });

  const magicMutation = trpc.auth.requestMagicLink.useMutation({
    onSuccess: (data) => {
      setMagicSent(true);
      if (data.debugUrl) setMagicDebugUrl(data.debugUrl);
    },
    onError: (err) => setServerError(err.message),
  });

  const isPending = loginMutation.isPending || registerMutation.isPending || magicMutation.isPending;

  function switchMode(next: "login" | "register" | "magic") {
    setMode(next);
    setServerError(null);
    setMagicSent(false);
    setMagicDebugUrl(null);
    loginForm.reset();
    registerForm.reset();
    magicForm.reset();
  }

  function onLogin(data: LoginForm) {
    setServerError(null);
    loginMutation.mutate(data);
  }

  function onRegister(data: RegisterForm) {
    setServerError(null);
    registerMutation.mutate(data);
  }

  function onMagicRequest(data: MagicForm) {
    setServerError(null);
    magicMutation.mutate(data);
  }

  const title = mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : "Sign in with email link";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">{title}</DialogTitle>
        </DialogHeader>

        {mode === "login" && (
          <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input id="login-email" type="email" placeholder="you@example.com" autoComplete="email" {...loginForm.register("email")} />
              {loginForm.formState.errors.email && <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input id="login-password" type="password" placeholder="••••••••" autoComplete="current-password" {...loginForm.register("password")} />
              {loginForm.formState.errors.password && <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>}
            </div>
            {serverError && <p className="text-sm text-destructive text-center">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Signing in…" : "Sign In"}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
            </div>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={() => switchMode("magic")} disabled={isPending}>
              <Mail className="h-4 w-4" /> Send me a magic link
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode("register")}>Sign up</button>
            </p>
          </form>
        )}

        {mode === "register" && (
          <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="reg-name">Name</Label>
              <Input id="reg-name" type="text" placeholder="Your name" autoComplete="name" {...registerForm.register("name")} />
              {registerForm.formState.errors.name && <p className="text-xs text-destructive">{registerForm.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Email</Label>
              <Input id="reg-email" type="email" placeholder="you@example.com" autoComplete="email" {...registerForm.register("email")} />
              {registerForm.formState.errors.email && <p className="text-xs text-destructive">{registerForm.formState.errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-password">Password</Label>
              <Input id="reg-password" type="password" placeholder="At least 8 characters" autoComplete="new-password" {...registerForm.register("password")} />
              {registerForm.formState.errors.password && <p className="text-xs text-destructive">{registerForm.formState.errors.password.message}</p>}
            </div>
            {serverError && <p className="text-sm text-destructive text-center">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Creating account…" : "Create Account"}
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
            </div>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={() => switchMode("magic")} disabled={isPending}>
              <Mail className="h-4 w-4" /> Use a magic link instead
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode("login")}>Sign in</button>
            </p>
          </form>
        )}

        {mode === "magic" && !magicSent && (
          <form onSubmit={magicForm.handleSubmit(onMagicRequest)} className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground text-center">Enter your email and we'll send you a sign-in link — no password needed.</p>
            <div className="space-y-1.5">
              <Label htmlFor="magic-email">Email</Label>
              <Input id="magic-email" type="email" placeholder="you@example.com" autoComplete="email" {...magicForm.register("email")} />
              {magicForm.formState.errors.email && <p className="text-xs text-destructive">{magicForm.formState.errors.email.message}</p>}
            </div>
            {serverError && <p className="text-sm text-destructive text-center">{serverError}</p>}
            <Button type="submit" className="w-full gap-2" disabled={isPending}>
              <Mail className="h-4 w-4" />{isPending ? "Sending…" : "Send Magic Link"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode("login")}>Back to sign in</button>
            </p>
          </form>
        )}

        {mode === "magic" && magicSent && (
          <div className="space-y-4 mt-2 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h3 className="font-semibold">Check your inbox</h3>
            <p className="text-sm text-muted-foreground">We've sent a sign-in link to your email. Click it to log in — it expires in 15 minutes.</p>
            {magicDebugUrl && (
              <div className="text-left bg-muted rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dev mode — link:</p>
                <a href={magicDebugUrl} className="text-xs text-primary break-all hover:underline">{magicDebugUrl}</a>
              </div>
            )}
            <button type="button" className="text-sm text-primary font-medium hover:underline" onClick={() => switchMode("magic")}>Send again</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
