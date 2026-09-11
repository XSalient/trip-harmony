import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell, Home, Plus, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * The bar spans the page and divides it, rather than hugging its own contents.
 *
 * It used to be `w-fit` around four 64px tabs — a ~294px bar floating under
 * ~360px of content, with the items packed into the narrower thing. Fixed tab
 * widths are what force that: they decide the bar's size from the inside, so
 * the only way to give an item room is to make the bar wider than the page or
 * the item narrower than its label.
 *
 * Now the bar takes the content's own gutter (`px-4`, matching `AppShell`'s
 * `<main>`) and each tab is `flex-1`, so a tab is a quarter of the page — about
 * 88px on a 390px screen against the 64px it had. Nothing is packed because
 * nothing is competing for a fixed budget.
 *
 * Equal `flex-1` cells are also what keeps the sliding indicator arithmetic
 * honest without measuring the DOM: one cell is exactly `100 / n` percent, so
 * the indicator is that wide and steps by exactly its own width. A tab that
 * sized to its label would break both the maths and the rhythm.
 */
const MAX_BAR_W = "28rem";

export default function MobileNav() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
  // This bar is on every authenticated screen, so its poll is the app's steady
  // background load — and it competes for the same few database connections as
  // whatever the person is actually waiting for. A minute is soon enough for a
  // badge, and a tab nobody is looking at does not need one at all.
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(
    undefined,
    {
      enabled: isAuthenticated,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
      staleTime: 30_000,
    }
  );

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/trips/new", icon: Plus, label: "New trip", create: true },
    { href: "/notifications", icon: Bell, label: "Alerts", badge: unreadCount },
    { href: "/profile", icon: User, label: "Profile" },
  ];

  const activeIndex = navItems.findIndex(item =>
    item.href === "/" ? location === "/" : location.startsWith(item.href)
  );

  // The pill only slides between tabs it has already been on. Animating it in
  // from the left edge on first paint would read as a loading artefact, so the
  // first position is taken without a transition.
  const [ready, setReady] = useState(false);
  const seen = useRef(false);
  useEffect(() => {
    if (activeIndex < 0 || seen.current) return;
    seen.current = true;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [activeIndex]);

  if (!isAuthenticated) return null;

  return (
    // A floating glass pill rather than a full-width slab: it reads as a
    // control sitting above the content instead of a border welded to the
    // bottom of the page, and it keeps every target inside the thumb arc.
    // `pointer-events-none` on the wrapper so the gap either side of the pill
    // does not swallow taps meant for the content behind it.
    <nav
      aria-label="Primary"
      // `px-4` is the content gutter from `AppShell`'s `<main>`. The bar lining
      // up with the cards above it is most of why it now reads as part of the
      // page rather than a widget dropped onto it.
      className="safe-area-bottom pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4"
    >
      <div
        // `p-1.5` rather than `p-1`: at 4px the 48px tabs — the filled create
        // one especially — sat almost on the glass edge. The extra 2px a side is
        // also what `--nav-height` accounts for; the two move together.
        //
        // Capped, because a quarter of a tablet is a very long way for a thumb
        // to travel to reach `Profile`.
        className="glass pointer-events-auto relative mx-auto mb-2 w-full rounded-full p-1.5 shadow-e3"
        style={{ maxWidth: MAX_BAR_W }}
      >
        {/* The track is the positioning context for the indicator, so a
            percentage there is a percentage of the tabs' own box and not of the
            bar's padding box. */}
        <div className="relative flex items-stretch">
          {/* The active indicator is one element that moves, not four that blink
              on and off. Following the thumb from tab to tab is the difference
              between a tab bar and four links (MASTER §7 `continuity`).

              Two elements, not one: the outer box is exactly one cell wide, so
              `translateX(index * 100%)` steps by exactly one tab whatever the
              screen is; the inner one carries the inset that keeps the fill off
              its neighbours. Insetting the sliding element itself would make its
              width — and therefore its own step — smaller than a cell, and the
              indicator would drift further behind with every tab. */}
          {activeIndex >= 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-0 left-0",
                ready &&
                  "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
              )}
              style={{
                width: `${100 / navItems.length}%`,
                transform: `translateX(${activeIndex * 100}%)`,
              }}
            >
              <span className="bg-primary/15 absolute inset-y-0 left-1.5 right-1.5 rounded-lg" />
            </span>
          )}

          {navItems.map((item, i) => {
            const isActive = i === activeIndex;

            return (
              <Link key={item.href} href={item.href} asChild>
                <a
                  onClick={() => {
                    if (!isActive) haptic("select");
                  }}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={
                    item.badge && item.badge > 0
                      ? `${item.label}, ${item.badge} unread`
                      : item.label
                  }
                  className={cn(
                    // `flex-1 basis-0` — equal quarters of the bar, never sized to
                    // the label. >=44px in both directions, inside the thumb arc.
                    "relative z-10 flex min-h-13 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-2xl py-2",
                    "touch-manipulation transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                    // Fill + colour + weight, so the active tab never depends on
                    // colour alone.
                    // The create action is the raised, gradient one — the same
                    // emphasis a centre FAB gives, without moving it in the bar.
                    item.create
                      ? "text-primary-foreground"
                      : isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {/* The create action's fill, inset by the same rule as the
                    active indicator so the two shapes never meet. A background
                    on the link itself would run the full cell and collide with
                    whatever fill sits beside it. */}
                  {item.create && (
                    <span
                      aria-hidden
                      className="grad-brand absolute inset-y-0 left-1.5 right-1.5 rounded-lg shadow-e2"
                    />
                  )}
                  <span className="relative z-10">
                    <item.icon
                      className={cn(
                        "h-5 w-5 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                        isActive && "-translate-y-px scale-110 stroke-[2.5px]"
                      )}
                    />
                    {item.badge && item.badge > 0 ? (
                      <span className="tabular animate-rise absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      // Never wrap: a label that breaks onto a second line makes
                      // one tab taller than the rest, and the pill is positioned
                      // on the assumption that they match.
                      "relative z-10 whitespace-nowrap text-[11px] leading-none",
                      isActive ? "font-semibold" : "font-medium"
                    )}
                  >
                    {item.label}
                  </span>
                </a>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
