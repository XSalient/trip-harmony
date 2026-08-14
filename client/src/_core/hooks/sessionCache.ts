import type { QueryClient } from "@tanstack/react-query";

/**
 * Throw away every answer cached for the previous session, and tell the
 * components still watching them.
 *
 * `queryClient.clear()` is the obvious call and the wrong one. It removes each
 * query from the cache and destroys it — but a `QueryObserver` subscribes to
 * the *query*, not to the cache, so removal notifies nobody. The components go
 * on rendering the last session's data from an observer bound to a query that
 * no longer exists, and they only notice when something unrelated happens to
 * re-render them. The refetch that used to follow had nothing to refetch
 * either: `refetchQueries` walks the cache, and the cache was empty, so it
 * resolved without a request. Taking a demo seat signed you in and left the
 * landing page on screen — the cookie was set, and only a reload showed it.
 *
 * `resetQueries` keeps each query where its observers can see it and puts it
 * back to its initial, dataless state — which does notify them — then refetches
 * the ones still mounted, under the new session. No frame is drawn with the
 * previous session's data, which was the point of clearing in the first place.
 *
 * A plain function over a `QueryClient` rather than a hook, so the rule can be
 * tested without a React renderer. See `sessionCache.test.ts`.
 */
export function resetSessionCache(queryClient: QueryClient): Promise<void> {
  return queryClient.resetQueries();
}

/**
 * The same reset for the way out of a session, without the re-asking.
 *
 * `resetSessionCache` re-answers whatever is still mounted, which is right on
 * the way in and wrong on the way out: what is mounted then is a dashboard full
 * of protected queries and a session that can no longer authorise any of them.
 * That is a burst of requests whose answers are all 401, all discarded a frame
 * later when `me` goes null and the screens unmount, and all visible in the
 * console of anyone who happens to have it open.
 *
 * Resetting each query directly notifies its observers exactly as
 * `resetQueries` does — that is what `reset()` is — and asks nobody anything.
 * Synchronous, because there is nothing to wait for.
 */
export function discardSessionCache(queryClient: QueryClient): void {
  queryClient
    .getQueryCache()
    .findAll()
    .forEach(query => query.reset());
}
