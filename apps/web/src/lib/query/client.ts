import { MutationCache, QueryCache } from "@tanstack/react-query";
import { createPlatformQueryClient } from "@tarodan/api-client/query";
import { logger } from "@/lib/logger";

/**
 * Shared QueryClient config — used by BOTH the browser client (lib/queryClient)
 * and the per-request server client (lib/query/server). Kept in one place so the
 * SSR-prefetched cache and the client cache behave identically (same staleTime,
 * retry, error reporting) — otherwise hydration mismatches or double-fetches creep in.
 */

/** Global query error handler: log to Sentry + (dev) console. */
export function onQueryError(
  error: unknown,
  query: { queryKey?: unknown; meta?: unknown },
) {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.error("React Query error:", query?.queryKey, error);
  }
  logger.captureException(error, {
    source: "react-query",
    queryKey: query?.queryKey,
    meta: query?.meta,
  });
}

/**
 * Global mutation error handler: report to Sentry.
 *
 * Wired on the `MutationCache`, NOT on `defaultOptions.mutations.onError`:
 * TanStack merges a mutation's own options over the defaults shallowly
 * (`{ ...defaults.mutations, ...options }`), so every hook that passes its own
 * `onError` (useWebMutation's toast, the wishlist rollback, …) silently
 * replaced the default and its errors never reached Sentry. A cache-level
 * callback always runs, before the mutation's own `onError`.
 *
 * Nothing is filtered here — every failed mutation is reported, as the old
 * default did. A mutation whose "error" is an expected outcome (e.g. the
 * wishlist's 409/404) resolves it inside its `mutationFn` instead of failing.
 */
export function onMutationError(
  error: unknown,
  mutation: { mutationKey?: unknown; meta?: unknown; context?: unknown },
) {
  logger.captureException(error, {
    source: "react-query",
    type: "mutation",
    mutationKey: mutation.mutationKey,
    meta: mutation.meta,
    context: mutation.context,
  });
}

export function makeQueryClient() {
  return createPlatformQueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, context, mutation) =>
        onMutationError(error, {
          mutationKey: mutation.options.mutationKey,
          meta: mutation.meta,
          context,
        }),
    }),
    queryCache: new QueryCache({
      onError: (error, query) =>
        onQueryError(error, {
          queryKey: (query as { queryKey?: unknown })?.queryKey,
          meta: (query as { meta?: unknown })?.meta,
        }),
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        refetchOnWindowFocus: false,
        // If the API isn't up yet (ECONNREFUSED) retry a few times with a delay.
        retry: (failureCount, error: unknown) => {
          const err = error as { code?: string; message?: string };
          const isNetworkError =
            err?.code === "ECONNREFUSED" ||
            err?.code === "ERR_NETWORK" ||
            (typeof err?.message === "string" &&
              (err.message.includes("ECONNREFUSED") ||
                err.message.includes("Network Error")));
          if (isNetworkError) return failureCount < 5;
          return failureCount < 1;
        },
        retryDelay: (attemptIndex) => Math.min(1500 * (attemptIndex + 1), 8000),
      },
    },
  });
}
