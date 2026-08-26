import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  httpBatchLink,
  httpLink,
  splitLink,
  TRPCClientError,
} from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { trackNavigationDepth } from "./lib/navigationDepth";
import "./index.css";

/**
 * Defaults, because React Query's own are wrong for this app.
 *
 * `staleTime: 0` plus a router that unmounts the page on every navigation means
 * every screen refetches its entire query set from scratch each time you reach
 * it — a trip page is eight or ten procedures, and moving between its tabs
 * re-asked all of them for answers React Query already held. That is most of
 * what "the app feels slow" was.
 *
 * Thirty seconds is safe here because every mutation already invalidates what
 * it changed, so the window only covers *other people's* edits, which were
 * never live anyway. `retry` stays low: `auth.me` travels on its own link with
 * its own timeout below, and the whole app is gated on it.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const LOGIN_PATH = "/";

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;
  // Already on the login page — redirecting would reload into the same error.
  if (window.location.pathname === LOGIN_PATH) return;

  // `replace`, not `href`: assigning `href` pushes, which leaves the screen we
  // are bouncing out of sitting behind us. Pressing back then returned to it,
  // it asked the same unauthorised question, and it bounced forward again —
  // a back button with no way out. Replacing drops the screen we are leaving.
  window.location.replace(LOGIN_PATH);
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

/**
 * The whole app is gated on `auth.me` resolving, so that one request must never
 * hang indefinitely (an unreachable database used to leave it pending forever).
 * Other procedures are left alone — some do slow AI work.
 *
 * Which is why `auth.me` travels on its own link, unbatched. This timeout used
 * to be applied by sniffing the request URL for "auth.me", but a batched URL
 * names every procedure in the batch, so it matched whenever `auth.me` was
 * merely travelling with fifteen trip queries — and aborting the request
 * aborted all of them. Mounting the trip page does exactly that, so a slow
 * batch failed `auth.me`, which reads as signed out, which bounced you home.
 */
const AUTH_REQUEST_TIMEOUT_MS = 15_000;

/** Abort signal that fires on timeout, or as soon as react-query cancels the query. */
const timeoutSignal = (
  upstream: AbortSignal | null | undefined,
  ms: number
) => {
  const controller = new AbortController();
  const abortFromUpstream = () => controller.abort(upstream?.reason);
  const timer = setTimeout(
    () =>
      controller.abort(new DOMException("Request timed out", "TimeoutError")),
    ms
  );

  if (upstream?.aborted) abortFromUpstream();
  else upstream?.addEventListener("abort", abortFromUpstream, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      upstream?.removeEventListener("abort", abortFromUpstream);
    },
  };
};

/** The session cookie has to ride along, on every link. */
const withCredentials = (init?: RequestInit): RequestInit => ({
  ...(init ?? {}),
  credentials: "include",
});

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: op => op.path === "auth.me",
      true: httpLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch(input, init) {
          const { signal, cleanup } = timeoutSignal(
            init?.signal,
            AUTH_REQUEST_TIMEOUT_MS
          );
          return globalThis
            .fetch(input, { ...withCredentials(init), signal })
            .finally(cleanup);
        },
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch: (input, init) => globalThis.fetch(input, withCredentials(init)),
      }),
    }),
  ],
});

// Before the first render, so the entry the document loaded on is counted.
trackNavigationDepth(window, window.history);

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
