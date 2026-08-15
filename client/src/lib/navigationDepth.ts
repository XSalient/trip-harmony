/**
 * How many screens of ours are stacked behind the one on display.
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
 * The count lives on the history entry rather than only in memory, because a
 * full page load — a hard refresh, or one of the auth redirects — throws the
 * module away while the history stack survives. `history.state` survives with
 * it, so a reload picks the count back up where the entry left it.
 *
 * Depth is read through the events wouter already dispatches (it patches
 * `pushState` to fire one, which is the only way to observe a navigation you
 * did not make) rather than by wrapping `navigate`, so `<Link>` — which calls
 * wouter's own navigate directly — is counted too.
 */

/** Namespaced, because wouter writes its own `state` through the same slot. */
export const DEPTH_KEY = "__btNavDepth";

type HistoryLike = {
  readonly state: unknown;
  replaceState(state: unknown, unused?: string): void;
};

type EventTargetLike = {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

/** The depth stamped on a history entry, or 0 for one we never stamped. */
export function depthOf(state: unknown): number {
  if (typeof state !== "object" || state === null) return 0;
  const value = (state as Record<string, unknown>)[DEPTH_KEY];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function stamp(history: HistoryLike, depth: number): void {
  const previous =
    typeof history.state === "object" && history.state !== null
      ? history.state
      : {};
  history.replaceState({ ...previous, [DEPTH_KEY]: depth }, "");
}

let depth = 0;

/** Whether `history.back()` lands on a screen of this app rather than off it. */
export function canGoBack(): boolean {
  return depth > 0;
}

/**
 * Starts counting. Call once, as early as the app has a history to watch.
 *
 * Returns a detach function; the app never calls it, but a test needs to stop
 * one stack before it starts the next.
 */
export function trackNavigationDepth(
  target: EventTargetLike,
  history: HistoryLike
): () => void {
  depth = depthOf(history.state);
  // The entry the document loaded on may never have been stamped — a deep
  // link, or the first screen of the session. Stamp it so returning to it
  // later reads back the same answer.
  stamp(history, depth);

  const onPush = () => {
    // The new entry carries wouter's `state`, which is null: its depth is one
    // deeper than the entry we just left, and only we know what that was.
    depth += 1;
    stamp(history, depth);
  };

  // A pop can move any distance in either direction, so the entry itself is
  // the only trustworthy source — hence stamping every one of them above.
  const onPop = () => {
    depth = depthOf(history.state);
  };

  target.addEventListener("pushState", onPush);
  target.addEventListener("popstate", onPop);

  return () => {
    target.removeEventListener("pushState", onPush);
    target.removeEventListener("popstate", onPop);
    depth = 0;
  };
}
