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

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AuthDialog({ open, onOpenChange, onSuccess }: AuthDialogProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [serverError, setServerError] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const registerForm = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      onSuccess();
    },
    onError: (err) => setServerError(err.message),
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      onSuccess();
    },
    onError: (err) => setServerError(err.message),
  });

  const isPending = loginMutation.isPending || registerMutation.isPending;

  function switchMode(next: "login" | "register") {
    setMode(next);
    setServerError(null);
    loginForm.reset();
    registerForm.reset();
  }

  function onLogin(data: LoginForm) {
    setServerError(null);
    loginMutation.mutate(data);
  }

  function onRegister(data: RegisterForm) {
    setServerError(null);
    registerMutation.mutate(data);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </DialogTitle>
        </DialogHeader>

        {mode === "login" ? (
          <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                {...loginForm.register("email")}
              />
              {loginForm.formState.errors.email && (
                <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                {...loginForm.register("password")}
              />
              {loginForm.formState.errors.password && (
                <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
              )}
            </div>
            {serverError && <p className="text-sm text-destructive text-center">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Signing in…" : "Sign In"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode("register")}>
                Sign up
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4 mt-2">
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
                <p className="text-xs text-destructive">{registerForm.formState.errors.name.message}</p>
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
                <p className="text-xs text-destructive">{registerForm.formState.errors.email.message}</p>
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
                <p className="text-xs text-destructive">{registerForm.formState.errors.password.message}</p>
              )}
            </div>
            {serverError && <p className="text-sm text-destructive text-center">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Creating account…" : "Create Account"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <button type="button" className="text-primary font-medium hover:underline" onClick={() => switchMode("login")}>
                Sign in
              </button>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
