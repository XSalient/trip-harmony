import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();

const LOGIN_PATH = "/";

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;
  // Already on the login page — redirecting would reload into the same error.
  if (window.location.pathname === LOGIN_PATH) return;

  window.location.href = LOGIN_PATH;
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
 */
const AUTH_REQUEST_TIMEOUT_MS = 15_000;

const requestUrl = (input: URL | RequestInfo) => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

/** Abort signal that fires on timeout, or as soon as react-query cancels the query. */
const timeoutSignal = (upstream: AbortSignal | null | undefined, ms: number) => {
  const controller = new AbortController();
  const abortFromUpstream = () => controller.abort(upstream?.reason);
  const timer = setTimeout(
    () => controller.abort(new DOMException("Request timed out", "TimeoutError")),
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

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        const options: RequestInit = {
          ...(init ?? {}),
          credentials: "include",
        };

        if (!requestUrl(input).includes("auth.me")) {
          return globalThis.fetch(input, options);
        }

        const { signal, cleanup } = timeoutSignal(
          init?.signal,
          AUTH_REQUEST_TIMEOUT_MS
        );
        return globalThis
          .fetch(input, { ...options, signal })
          .finally(cleanup);
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
