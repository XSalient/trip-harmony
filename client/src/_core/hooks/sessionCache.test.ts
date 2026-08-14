import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { discardSessionCache, resetSessionCache } from "./sessionCache";

/**
 * A mounted `useQuery`, without React: an observer with a live subscription is
 * what a rendered component amounts to as far as the cache is concerned.
 */
function mountQuery(
  client: QueryClient,
  queryFn: () => Promise<unknown>,
  queryKey: string[] = ["auth", "me"]
) {
  const observer = new QueryObserver(client, {
    queryKey,
    queryFn,
    retry: false,
  });
  const unsubscribe = observer.subscribe(() => {});
  return { observer, unsubscribe };
}

describe("resetSessionCache", () => {
  it("re-answers a mounted query for the new session", async () => {
    const queryFn = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce({ name: "Ava" })
      .mockResolvedValue({ name: "Nina" });
    const client = new QueryClient();
    const { observer, unsubscribe } = mountQuery(client, queryFn);

    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toEqual({ name: "Ava" })
    );

    await resetSessionCache(client);

    // The component watching this query has to be told, or it renders the
    // previous seat's data until something unrelated re-renders it.
    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toEqual({ name: "Nina" })
    );
    expect(queryFn).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("leaves nothing of the previous session in the cache", async () => {
    const queryFn = vi.fn<() => Promise<unknown>>().mockResolvedValue("Ava");
    const client = new QueryClient();
    client.setQueryData(["trips", "list"], ["Ava's trip"]);
    const { unsubscribe } = mountQuery(client, queryFn);

    await resetSessionCache(client);

    // An unmounted screen's data is the leak the clearing exists to stop: it is
    // what the next seat's first paint would come from.
    expect(client.getQueryData(["trips", "list"])).toBeUndefined();

    unsubscribe();
  });
});

describe("discardSessionCache", () => {
  it("tells a mounted query its data is gone", async () => {
    const queryFn = vi.fn<() => Promise<unknown>>().mockResolvedValue("Ava");
    const client = new QueryClient();
    const { observer, unsubscribe } = mountQuery(client, queryFn);

    await vi.waitFor(() =>
      expect(observer.getCurrentResult().data).toBe("Ava")
    );

    discardSessionCache(client);

    // Same notification `resetQueries` gives; the screen must not be left
    // rendering the session that has just ended.
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(client.getQueryData(["auth", "me"])).toBeUndefined();

    unsubscribe();
  });

  it("asks nothing on the way out, because nothing may be asked", async () => {
    const asked: string[] = [];
    const client = new QueryClient();
    const mount = (key: string[]) =>
      mountQuery(
        client,
        async () => {
          asked.push(key.join("."));
          return "data";
        },
        key
      );
    const mounted = [
      mount(["auth", "me"]),
      mount(["trips", "list"]),
      mount(["notifications", "unreadCount"]),
    ];
    await vi.waitFor(() => expect(asked).toHaveLength(3));
    asked.length = 0;

    discardSessionCache(client);
    await Promise.resolve();

    // `resetQueries` re-asks all three here, and the session has just been
    // ended — two of the three answer 401 into the console for nothing.
    expect(asked).toEqual([]);

    mounted.forEach(m => m.unsubscribe());
  });
});
