/**
 * What is behind the screen on display: how many of ours, and which one.
 *
 * The back arrow used to call `navigate(backHref)`, which is `pushState` — so
 * backing out of a screen *appended* to history rather than unwinding it.
 * Walk in and back out of two screens and the browser's own back button then
 * replays the trail forwards, into the screens you just left. From the trip
 * page it took you to the section you had just closed, which reads as a back
 * button that does not work.
 *
 * Popping is the right move, but only while a screen of ours is behind: on a
 * deep link, a shared URL, or the first paint after a redirect there is none,
 * and `history.back()` would leave the site. So we count.
 *
 * Counting alone was not enough either. The arrow is an **up** control — it
 * goes to the screen above this one in the app, which is what `backHref` names
 * — and history is not a hierarchy. Arrive at the accommodations screen from
 * the notifications list and popping lands on notifications: sideways, not up,
 * and the label on the trip page you were expecting never appears. So we also
 * record *which* path each entry sits in front of, and pop only when the entry
 * behind this one is the very screen the arrow was going to anyway. Anything
 * else is a jump, and `AppShell` replaces the current entry with the parent
 * instead.
 *
 * Both facts live on the history entry rather than only in memory, because a
 * full page load — a hard refresh, or one of the auth redirects — throws the
 * module away while the history stack survives. `history.state` survives with
 * it, so a reload picks them back up where the entry left them.
 *
 * Depth is read through the events wouter already dispatches (it patches
 * `pushState` to fire one, which is the only way to observe a navigation you
 * did not make) rather than by wrapping `navigate`, so `<Link>` — which calls
 * wouter's own navigate directly — is counted too.
 */

/** Namespaced, because wouter writes its own `state` through the same slot. */
export const DEPTH_KEY = "__btNavDepth";
/** The path of the entry immediately behind this one, or absent for none. */
export const FROM_KEY = "__btNavFrom";

type HistoryLike = {
  readonly state: unknown;
  replaceState(state: unknown, unused?: string): void;
};

type EventTargetLike = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

/** Enough of `window.location` to know which screen an entry is showing. */
type LocationLike = { readonly pathname: string };

/** The depth stamped on a history entry, or 0 for one we never stamped. */
export function depthOf(state: unknown): number {
  if (typeof state !== "object" || state === null) return 0;
  const value = (state as Record<string, unknown>)[DEPTH_KEY];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

/** The path stamped as being behind a history entry, or null. */
export function fromOf(state: unknown): string | null {
  if (typeof state !== "object" || state === null) return null;
  const value = (state as Record<string, unknown>)[FROM_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * True while we are writing the stamp ourselves.
 *
 * `replaceState` is patched by wouter to dispatch an event, and we listen for
 * it — so without this the stamp would trigger the handler that writes it.
 */
let stamping = false;

function stamp(history: HistoryLike, depth: number, from: string | null): void {
  const previous =
    typeof history.state === "object" && history.state !== null
      ? history.state
      : {};
  stamping = true;
  try {
    history.replaceState(
      { ...previous, [DEPTH_KEY]: depth, [FROM_KEY]: from },
      ""
    );
  } finally {
    stamping = false;
  }
}

let depth = 0;
/** The path the entry behind this one is showing. */
let behind: string | null = null;
/** The path this entry is showing, so the next push knows what it left. */
let here = "";

/** Whether `history.back()` lands on a screen of this app rather than off it. */
export function canGoBack(): boolean {
  return depth > 0;
}

/**
 * Whether going back would land on `path` — the one case where the up arrow
 * may pop instead of navigating.
 *
 * Compared on the path alone: `backHref` is always a bare path, and a query
 * string or hash does not make it a different screen.
 */
export function isBehind(path: string | undefined): boolean {
  if (!path || !canGoBack() || behind === null) return false;
  return normalise(behind) === normalise(path);
}

/** Trailing slashes and anything after the path are not part of the screen. */
function normalise(path: string): string {
  const bare = path.split("#")[0].split("?")[0];
  return bare.length > 1 && bare.endsWith("/") ? bare.slice(0, -1) : bare;
}

/**
 * Starts counting. Call once, as early as the app has a history to watch.
 *
 * Returns a detach function; the app never calls it, but a test needs to stop
 * one stack before it starts the next.
 */
export function trackNavigationDepth(
  target: EventTargetLike,
  history: HistoryLike,
  location: LocationLike = window.location
): () => void {
  depth = depthOf(history.state);
  behind = fromOf(history.state);
  here = location.pathname;
  // The entry the document loaded on may never have been stamped — a deep
  // link, or the first screen of the session. Stamp it so returning to it
  // later reads back the same answer.
  stamp(history, depth, behind);

  const onPush = () => {
    // The new entry carries wouter's `state`, which is null: its depth is one
    // deeper than the entry we just left, and only we know what that was. The
    // same goes for the path it sits in front of — by the time this fires,
    // `location` is already showing the new one.
    depth += 1;
    behind = here;
    here = location.pathname;
    stamp(history, depth, behind);
  };

  // A pop can move any distance in either direction, so the entry itself is
  // the only trustworthy source — hence stamping every one of them above.
  const onPop = () => {
    depth = depthOf(history.state);
    behind = fromOf(history.state);
    here = location.pathname;
  };

  // A replace does not move the cursor, so neither fact changes — but wouter's
  // own `navigate(to, { replace: true })` writes its state through the same
  // call and wipes the stamp with it, and the entry is now showing a different
  // path. Put both back.
  const onReplace = () => {
    if (stamping) return;
    here = location.pathname;
    stamp(history, depth, behind);
  };

  target.addEventListener("pushState", onPush);
  target.addEventListener("replaceState", onReplace);
  target.addEventListener("popstate", onPop);

  return () => {
    target.removeEventListener("pushState", onPush);
    target.removeEventListener("replaceState", onReplace);
    target.removeEventListener("popstate", onPop);
    depth = 0;
    behind = null;
    here = "";
  };
}
