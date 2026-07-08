import { QueryCache, QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';

/**
 * Shared QueryClient config — used by BOTH the browser client (lib/queryClient)
 * and the per-request server client (lib/query/server). Kept in one place so the
 * SSR-prefetched cache and the client cache behave identically (same staleTime,
 * retry, error reporting) — otherwise hydration mismatches or double-fetches creep in.
 */

/** Global query error handler: log to Sentry + (dev) console. */
export function onQueryError(error: unknown, query: { queryKey?: unknown; meta?: unknown }) {
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.error('React Query error:', query?.queryKey, error);
  }
  Sentry.captureException(error, {
    tags: { layer: 'ReactQuery', type: 'query' },
    extra: { queryKey: query?.queryKey, meta: query?.meta },
  });
}

export function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) =>
        onQueryError(error, { queryKey: (query as { queryKey?: unknown })?.queryKey, meta: (query as { meta?: unknown })?.meta }),
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        refetchOnWindowFocus: false,
        // If the API isn't up yet (ECONNREFUSED) retry a few times with a delay.
        retry: (failureCount, error: unknown) => {
          const err = error as { code?: string; message?: string };
          const isNetworkError =
            err?.code === 'ECONNREFUSED' ||
            err?.code === 'ERR_NETWORK' ||
            (typeof err?.message === 'string' &&
              (err.message.includes('ECONNREFUSED') || err.message.includes('Network Error')));
          if (isNetworkError) return failureCount < 5;
          return failureCount < 1;
        },
        retryDelay: (attemptIndex) => Math.min(1500 * (attemptIndex + 1), 8000),
      },
      mutations: {
        onError: (error: unknown, _variables: unknown, context: unknown) => {
          Sentry.captureException(error, {
            tags: { layer: 'ReactQuery', type: 'mutation' },
            extra: { context },
          });
        },
      },
    },
  });
}
