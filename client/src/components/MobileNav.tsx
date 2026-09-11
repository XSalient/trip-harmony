import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bell, Home, Plus, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Every tab is the same width, which is what lets the active pill be placed by
 * arithmetic instead of by measuring the DOM: `translateX(index * TAB_W)`.
 * Keep them equal — a label long enough to stretch its tab breaks the slide.
 */
const TAB_W = 72;

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
      className="safe-area-bottom pointer-events-none fixed inset-x-0 bottom-0 z-50"
    >
      <div className="glass pointer-events-auto relative mx-auto mb-2 flex w-fit items-center rounded-full p-1 shadow-e3">
        {/* The active pill is one element that moves, not four that blink on
            and off. Following the thumb from tab to tab is the difference
            between a tab bar and four links (MASTER §7 `continuity`). */}
        {activeIndex >= 0 && (
          <span
            aria-hidden
            className={cn(
              "bg-primary/15 absolute left-1 top-1 bottom-1 rounded-full",
              ready &&
                "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            )}
            style={{
              width: TAB_W,
              transform: `translateX(${activeIndex * TAB_W}px)`,
            }}
          />
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
                  // >=44px in both directions, comfortably inside the thumb arc.
                  "relative z-10 flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full py-1.5",
                  "touch-manipulation transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  // Fill + colour + weight, so the active tab never depends on
                  // colour alone.
                  // The create action is the raised, gradient one — the same
                  // emphasis a centre FAB gives, without moving it in the bar.
                  item.create
                    ? "grad-brand text-primary-foreground shadow-e2"
                    : isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                )}
                style={{ width: TAB_W }}
              >
                <span className="relative">
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
                    "text-[10px]",
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
    </nav>
  );
}
