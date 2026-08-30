import { trpc } from "@/lib/trpc";
import { clearSessionToken } from "@/lib/session";
import { TRPCClientError } from "@trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import { discardSessionCache, resetSessionCache } from "./sessionCache";

/**
 * Throw away everything the last person cached, then find out who this one is.
 *
 * Every query in this app is answered for whoever the cookie says you are —
 * trips, roles, proposals, notifications. Signing in as somebody else while
 * only invalidating `auth.me` leaves all of that on screen, and React Query
 * serves it from cache before the refetch lands. The demo makes it obvious,
 * because switching seats is the point of it: take Nina's seat after Ava's and
 * the first paint is Ava's three trips, complete with the finalise buttons
 * Nina does not have.
 *
 * Reset rather than invalidate: invalidation keeps the stale data and marks it
 * for refresh, which is exactly the frame we are trying not to draw. And reset
 * rather than `clear()`, which drops the queries out of the cache without
 * telling the components observing them — see `resetSessionCache`.
 *
 * Use this on every path that changes who the session belongs to — signing in,
 * registering, a passkey, a magic link, taking a demo seat, signing out.
 */
export function useSessionSwitch() {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  return useCallback(async () => {
    // Resolves once the queries still on screen have been re-answered for the
    // new session; `me` is awaited on top because the caller usually navigates
    // on the strength of it, and it may not have been mounted here at all.
    await resetSessionCache(queryClient);
    await utils.auth.me.refetch();
  }, [queryClient, utils]);
}

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = "/" } =
    options ?? {};
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      // The cookie is cleared by the server; the native builds hold the token
      // themselves, so signing out has to drop it here as well or the app
      // stays signed in with a session the server has already forgotten.
      await clearSessionToken();
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      // The whole cache, not just `me`: the next person to sign in from this
      // tab must not be shown the last one's trips while their own load.
      //
      // Discarding rather than resetting: the screens still mounted here are
      // about to unmount when `me` goes null on the next line, so re-answering
      // them would only fire requests this session can no longer authorise.
      discardSessionCache(queryClient);
      utils.auth.me.setData(undefined, null);
    }
  }, [logoutMutation, queryClient, utils]);

  useEffect(() => {
    try {
      localStorage.setItem(
        "manus-runtime-user-info",
        JSON.stringify(meQuery.data ?? null)
      );
    } catch {
      // Storage can be unavailable (private mode, blocked third-party storage).
      // It is a cache for the runtime, so failing to write it is not fatal.
    }
  }, [meQuery.data]);

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    // A failed `me` is not a signed-out `me`. The server refuses this
    // procedure when it could not determine the session at all — a dropped
    // database connection, a pool timeout — rather than reporting null and
    // having the whole client conclude you are signed out. That refusal still
    // leaves `user` null here, so without this the redirect would fire anyway
    // and a blip would go on logging people out mid-trip.
    if (meQuery.error) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    // `replace`, not `href`. Assigning `href` pushes a history entry, so the
    // screen we are bouncing out of stayed behind us: back returned to it, it
    // asked the same question, and it bounced forward again. Replacing spends
    // the entry we are leaving instead of stacking another on top of it.
    window.location.replace(redirectPath);
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    meQuery.error,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
