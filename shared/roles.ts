/**
 * Trip membership roles, and the one place their ordering is defined.
 *
 * Both sides import this: the server to authorise, the client to label and to
 * decide what to render. The server is what enforces it — see
 * `requireTripRole` and the projections in `server/routers/_shared.ts`. A UI
 * that hides a control has still been sent whatever the API returned.
 */

export const TRIP_ROLES = ["watcher", "tripmate", "admin"] as const;
export type TripRole = (typeof TRIP_ROLES)[number];

/**
 * Least to most capable. Comparing these ranks is the only correct way to ask
 * "is this member at least an X?" — never compare the strings.
 */
export const TRIP_ROLE_RANK: Record<TripRole, number> = {
  watcher: 0,
  tripmate: 1,
  admin: 2,
};

export function hasTripRole(role: TripRole, atLeast: TripRole): boolean {
  return TRIP_ROLE_RANK[role] >= TRIP_ROLE_RANK[atLeast];
}

export const TRIP_ROLE_LABELS: Record<TripRole, string> = {
  admin: "Admin",
  tripmate: "Tripmate",
  watcher: "Watcher",
};

export const TRIP_ROLE_DESCRIPTIONS: Record<TripRole, string> = {
  admin:
    "Can do everything: invite people, change roles, edit the trip, and finalise proposals.",
  tripmate: "Can vote, add proposals and comment.",
  watcher:
    "Can view the trip only. Sees other members' names, but no contact details, no who-proposed-what and no votes.",
};

/**
 * A watcher sees the trip but nothing personal about the people on it. Kept as
 * a named predicate so the rule reads the same at every call site rather than
 * being re-derived as `role === "watcher"` in a dozen places.
 */
export function canSeeMemberDetails(role: TripRole): boolean {
  return hasTripRole(role, "tripmate");
}

/** Watchers cannot change anything on the trip. */
export function canContribute(role: TripRole): boolean {
  return hasTripRole(role, "tripmate");
}

/** Only admins invite, change roles, edit the trip, and finalise proposals. */
export function canAdminister(role: TripRole): boolean {
  return hasTripRole(role, "admin");
}
