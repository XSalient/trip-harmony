import { Link, useLocation } from "wouter";
import { Bell, Home, Plus, User } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";

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

  if (!isAuthenticated) return null;

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/trips/new", icon: Plus, label: "New Trip" },
    { href: "/notifications", icon: Bell, label: "Alerts", badge: unreadCount },
    { href: "/profile", icon: User, label: "Profile" },
  ];

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
      <div className="glass pointer-events-auto mx-auto mb-2 flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-full p-1.5 shadow-e3">
        {navItems.map(item => {
          const isActive =
            item.href === "/"
              ? location === "/"
              : location.startsWith(item.href);

          return (
            <Link key={item.href} href={item.href} asChild>
              <a
                aria-current={isActive ? "page" : undefined}
                aria-label={
                  item.badge && item.badge > 0
                    ? `${item.label}, ${item.badge} unread`
                    : item.label
                }
                className={cn(
                  // >=44px in both directions, comfortably inside the thumb arc.
                  "relative flex min-h-12 min-w-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-full px-3 py-1.5",
                  "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                  // Fill + colour + weight, so the active tab never depends on
                  // colour alone.
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="relative">
                  <item.icon
                    className={cn("h-5 w-5", isActive && "stroke-[2.5px]")}
                  />
                  {item.badge && item.badge > 0 ? (
                    <span className="tabular absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
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
