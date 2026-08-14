import { trpc } from "@/lib/trpc";
import {
  canAdminister,
  canContribute,
  canSeeMemberDetails,
  type TripRole,
} from "@shared/roles";

/**
 * The caller's role on one trip, and what it lets them do.
 *
 * Every trip screen asks this, and before it existed each one re-derived the
 * answer: `myRole?.role === "admin"` in nine files, and the contribute rule in
 * exactly one of them — which is how watchers ended up with vote buttons on
 * every screen except the dashboard. The predicates come from
 * `shared/roles.ts`, so client and server agree by construction rather than by
 * both remembering the same string.
 *
 * **Hiding a control is not a permission check.** The server refuses a watcher
 * regardless (`requireTripRole`); this only keeps the app from offering
 * buttons that can do nothing but fail.
 */
export function useTripRole(tripId: number) {
  const { data, isLoading } = trpc.trips.myRole.useQuery(
    { tripId },
    { enabled: tripId > 0 }
  );

  // `null` while the answer is in flight, and for a non-member. Both mean the
  // same thing here: assume the least until told otherwise. A control that
  // appears a moment late is better than one that appears and is taken away.
  const role = (data?.role ?? null) as TripRole | null;

  return {
    role,
    isLoading,
    isWatcher: role === "watcher",
    /** Vote, propose, comment, edit and delete. */
    canContribute: role !== null && canContribute(role),
    /** Invite, change roles, edit the trip, finalise. */
    canAdminister: role !== null && canAdminister(role),
    /** Emails, budgets, who proposed what, who voted how. */
    canSeeMemberDetails: role !== null && canSeeMemberDetails(role),
  };
}
