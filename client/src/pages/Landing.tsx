import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  DollarSign,
  Eye,
  Scale,
  Shield,
  Sparkles,
  Vote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthDialog } from "@/components/AuthDialog";
import { trpc } from "@/lib/trpc";
import { DEMO_TOUR_INVITE_CODE } from "@shared/demo";
import { cn } from "@/lib/utils";
import { IconTile, StatusPill, Surface } from "@/components/harmony";
import DemoSeatDialog from "@/components/DemoSeatDialog";

/**
 * The logged-out marketing surface.
 *
 * Split out of Home.tsx, which held both this and the authenticated dashboard.
 * Every capability master's version had is kept: the demo-seat tour behind its
 * host check, and the policy links a store reviewer has to be able to reach
 * without an account.
 *
 * No framer-motion here — Home is eagerly imported, so this ships in the entry
 * chunk. The motion is CSS.
 */

const STEPS = [
  {
    icon: Vote,
    title: "Everyone votes",
    body: "Dates, places, stays. One tap each — yes, maybe, or no.",
    tone: "cat-1" as const,
  },
  {
    icon: Scale,
    title: "WeVoTrip finds the overlap",
    body: "It weighs the vetoes, spots the standoff, and proposes the compromise.",
    tone: "cat-4" as const,
  },
  {
    icon: CalendarCheck,
    title: "You book it",
    body: "One agreed plan, one shared budget, nobody quietly resentful.",
    tone: "cat-3" as const,
  },
];

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Trip preferences",
    body: "Your must-haves and dealbreakers, per trip.",
    tone: "cat-5" as const,
    wide: true,
  },
  {
    icon: Vote,
    title: "Smart voting",
    body: "Love, fine or veto on every option.",
    tone: "cat-1" as const,
  },
  {
    icon: Shield,
    title: "AI referee",
    body: "Spots conflicts, suggests compromises.",
    tone: "cat-4" as const,
  },
  {
    icon: DollarSign,
    title: "Budget guard",
    body: "Per-person tracking, with alerts before it gets awkward.",
    tone: "cat-6" as const,
    wide: true,
  },
];

export default function Landing() {
  const [authOpen, setAuthOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Public query: it answers for a signed-out visitor, which is the whole point.
  const { data: demoTrip } = trpc.trips.getByInviteCode.useQuery({
    code: DEMO_TOUR_INVITE_CODE,
  });

  // Whether this host is the demo's. The product site and the demo are one
  // deployment behind two domains, so the server has to say which one answered.
  const { data: capabilities } = trpc.auth.capabilities.useQuery();

  // The sticky bar appears once the hero CTA has scrolled away, so the primary
  // action is always within thumb reach without doubling up on first paint.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const showDemo = !!(capabilities?.demoTour && demoTrip);

  return (
    <div className="min-h-dvh bg-background">
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        // `AuthDialog` has already reset the session cache by the time this runs.
        onSuccess={() => setAuthOpen(false)}
      />
      <DemoSeatDialog open={demoOpen} onOpenChange={setDemoOpen} />

      <header className="safe-area-top">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-5">
          <span className="font-display text-[17px] font-extrabold tracking-tight">
            WeVoTrip
          </span>
          <Button variant="ghost" size="sm" onClick={() => setAuthOpen(true)}>
            Sign in
          </Button>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden px-5 pb-16 pt-6">
        {/* Two soft washes rather than one flat overlay: enough depth to read
            as a lit surface, far short of a mesh-gradient light show. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div
            className="absolute -top-32 left-1/2 h-[420px] w-[520px] -translate-x-1/2 rounded-full opacity-[0.18] blur-3xl"
            style={{ background: "var(--grad-brand)" }}
          />
          <div
            className="absolute -right-24 top-40 h-[280px] w-[280px] rounded-full opacity-[0.14] blur-3xl"
            style={{ background: "var(--grad-cool)" }}
          />
        </div>

        <div className="mx-auto flex max-w-lg flex-col items-center text-center">
          <div className="animate-rise">
            <StatusPill tone="primary" icon={Sparkles}>
              AI-powered group travel
            </StatusPill>
          </div>

          <h1
            className="animate-rise mt-5 text-balance font-display text-[30px] font-extrabold leading-[1.12] tracking-tight sm:text-[36px]"
            style={{ animationDelay: "45ms" }}
          >
            Plan the trip
            <br />
            <span className="text-grad-brand">without the group chat</span>
          </h1>

          <p
            className="animate-rise mx-auto mt-4 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground"
            style={{ animationDelay: "90ms" }}
          >
            Eleven unread messages and three conflicting opinions, turned into
            one plan everybody actually agreed to.
          </p>

          <div
            className="animate-rise mt-7 w-full max-w-xs space-y-3"
            style={{ animationDelay: "135ms" }}
          >
            <Button
              size="lg"
              className="h-13 w-full text-base"
              onClick={() => setAuthOpen(true)}
            >
              Start a trip
              <ArrowRight />
            </Button>

            {/* Both have to hold. `demoTour` keeps it off the product site, which
                serves the same build from a different domain. And a demo has to
                have been seeded — a button leading to "Trip not found" is worse
                than no button. Presentation only: `auth.demoSignIn` applies the
                host rule itself. */}
            {showDemo && (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-13 w-full text-base"
                  onClick={() => setDemoOpen(true)}
                >
                  <Eye />
                  See a real trip
                </Button>
                <p className="text-xs text-muted-foreground">
                  Seven people, mid-argument. No sign-up.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section className="border-y border-border/60 bg-secondary/40 px-5 py-14">
        <div className="mx-auto max-w-lg">
          <h2 className="text-balance text-center font-display text-2xl font-bold tracking-tight">
            Three steps, no arguing
          </h2>

          <ol className="mt-8 space-y-3">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="stagger-item"
                style={{ ["--i" as never]: i }}
              >
                <Surface className="flex gap-4 p-4" elevation={1}>
                  <IconTile icon={step.icon} tone={step.tone} size="lg" />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-baseline gap-2">
                      <span className="tabular text-xs font-bold text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <h3 className="font-display text-[17px] font-bold tracking-tight">
                        {step.title}
                      </h3>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </Surface>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* --------------------------------------------------------- features */}
      <section className="px-5 py-14">
        <div className="mx-auto max-w-lg">
          <h2 className="text-balance text-center font-display text-2xl font-bold tracking-tight">
            What it does for you
          </h2>

          {/* Bento: the lead feature takes the full width, the rest pair up. */}
          <div className="mt-8 grid grid-cols-2 items-stretch gap-3">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={cn("stagger-item h-full", f.wide && "col-span-2")}
                style={{ ["--i" as never]: i }}
              >
                <Surface
                  variant={f.wide ? "gradient" : "solid"}
                  className={cn(
                    "h-full p-4",
                    f.wide && "flex items-center gap-4"
                  )}
                  elevation={1}
                >
                  <IconTile
                    icon={f.icon}
                    tone={f.tone}
                    size={f.wide ? "lg" : "md"}
                  />
                  <div className={cn(!f.wide && "mt-3")}>
                    <h3 className="font-display text-[15px] font-bold tracking-tight">
                      {f.title}
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      {f.body}
                    </p>
                  </div>
                </Surface>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- closing CTA */}
      <section className="px-5 pb-16">
        <div className="mx-auto max-w-lg">
          <Surface
            variant="gradient"
            elevation={2}
            className="overflow-hidden p-6 text-center"
          >
            <h2 className="text-balance font-display text-xl font-bold tracking-tight">
              Everyone gets a say. Somebody still has to book it.
            </h2>
            <p className="mx-auto mt-2 max-w-[32ch] text-sm text-muted-foreground">
              Free to start. Invite your group with one link.
            </p>
            <Button
              size="lg"
              className="mt-5 h-13 w-full max-w-xs"
              onClick={() => setAuthOpen(true)}
            >
              Start a trip
              <ArrowRight />
            </Button>
          </Surface>
        </div>
      </section>

      {/* The landing page is the only screen a signed-out visitor sees, so it
          is where the policy links have to be: a store reviewer opening the app
          without an account still has to be able to reach them. */}
      <footer className="safe-area-bottom mx-auto flex max-w-lg justify-center gap-4 px-5 pb-28 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
      </footer>

      {/* Thumb-reachable primary action once the hero has scrolled past. */}
      <div
        // Inline transform rather than translate-y-* utilities: Tailwind v4
        // drives those through the CSS `translate` property, and toggling
        // between an arbitrary value and 0 did not reliably reset it here.
        style={{ transform: scrolled ? "translateY(0)" : "translateY(130%)" }}
        aria-hidden={!scrolled}
        className="safe-area-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-3 transition-transform duration-300 ease-out motion-reduce:transition-none"
      >
        <div className="glass pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-2xl p-2 shadow-e3">
          <p className="min-w-0 flex-1 pl-2 text-[13px] font-medium">
            Ready when your group is
          </p>
          <Button onClick={() => setAuthOpen(true)}>Start a trip</Button>
        </div>
      </div>
    </div>
  );
}
