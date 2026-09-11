import type { QueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { trpc } from "@/lib/trpc";
import * as fx from "./fixtures";

/**
 * Puts a whole trip into the query cache so the real screens have something to
 * render.
 *
 * Every screen but the landing page is behind a session, and a session needs a
 * database. This is how the app is reviewed without one: seed the answers and
 * let the actual page components draw them. No mock screens, no parallel
 * markup — what you look at is what ships.
 *
 * Two details make it hold still:
 *
 * - `updatedAt` is set far ahead, so React Query never considers a seeded
 *   answer stale and never refetches it over a network with no server behind
 *   it. Without it every screen would blank thirty seconds in, which is
 *   `staleTime` in `main.tsx`.
 * - It runs at boot, not only on the seed page. The cache is in memory, so a
 *   full page load — a reload, or a link followed outside the router — would
 *   otherwise land on an empty one.
 *
 * Mutations are not seeded and will fail. That is correct: this is a surface
 * for judging layout, density, colour and motion, not for exercising
 * behaviour.
 *
 * Development only. `PREVIEW_FIXTURES_KEY` is read behind `import.meta.env.DEV`
 * at both call sites, so a production bundle has no path in here.
 */

export const PREVIEW_FIXTURES_KEY = "preview-fixtures";

/** Far enough ahead that `staleTime` never expires during a review session. */
const NEVER_STALE = Date.now() + 365 * 24 * 60 * 60 * 1000;

const TRIP = { tripId: fx.TRIP_ID };

export function fixturesRequested(): boolean {
  try {
    return window.sessionStorage?.getItem(PREVIEW_FIXTURES_KEY) === "1";
  } catch {
    // Private mode, or storage blocked. Not having a review surface is a
    // better outcome than failing to boot.
    return false;
  }
}

export function requestFixtures(): void {
  try {
    window.sessionStorage.setItem(PREVIEW_FIXTURES_KEY, "1");
  } catch {
    /* see above */
  }
}

export function seedFixtures(qc: QueryClient): void {
  const put = (key: unknown[], data: unknown) =>
    qc.setQueryData(key as never, data as never, { updatedAt: NEVER_STALE });

  put(getQueryKey(trpc.auth.me, undefined, "query"), fx.me);
  put(getQueryKey(trpc.trips.list, undefined, "query"), fx.tripsList);
  put(getQueryKey(trpc.trips.get, { id: fx.TRIP_ID }, "query"), fx.trip);
  put(getQueryKey(trpc.trips.myRole, TRIP, "query"), { role: "admin" });
  put(getQueryKey(trpc.trips.members, TRIP, "query"), fx.members);
  put(getQueryKey(trpc.trips.invites, TRIP, "query"), fx.invites);
  put(getQueryKey(trpc.groups.list, TRIP, "query"), fx.groups);
  put(getQueryKey(trpc.groups.attendees, TRIP, "query"), fx.attendees);
  put(getQueryKey(trpc.groups.headcount, TRIP, "query"), fx.headcount);
  put(getQueryKey(trpc.contacts.list, undefined, "query"), fx.contacts);
  put(getQueryKey(trpc.contacts.groups, undefined, "query"), fx.contactGroups);
  put(getQueryKey(trpc.dates.list, TRIP, "query"), fx.dates);
  put(getQueryKey(trpc.destinations.list, TRIP, "query"), fx.destinations);
  put(getQueryKey(trpc.accommodations.list, TRIP, "query"), fx.accommodations);
  put(getQueryKey(trpc.budget.list, TRIP, "query"), fx.budgets);
  put(getQueryKey(trpc.budget.summary, TRIP, "query"), fx.budgetSummary);
  put(getQueryKey(trpc.notifications.list, undefined, "query"), fx.notifications);
  put(getQueryKey(trpc.notifications.unreadCount, undefined, "query"), 2);
}
