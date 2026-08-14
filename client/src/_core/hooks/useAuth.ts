import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

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
 * `clear()` rather than `invalidate()`: invalidation keeps the stale data and
 * marks it for refresh, which is exactly the frame we are trying not to draw.
 *
 * Use this on every path that changes who the session belongs to — signing in,
 * registering, a passkey, a magic link, taking a demo seat, signing out.
 */
export function useSessionSwitch() {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  return useCallback(async () => {
    queryClient.clear();
    // Mounted queries refetch on their own once the cache is empty; `me` is
    // awaited because the caller usually navigates on the strength of it.
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
    onSuccess: () => {
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
      queryClient.clear();
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
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath;
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
