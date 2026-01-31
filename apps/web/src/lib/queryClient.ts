'use client';

import { QueryCache, QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/nextjs';

/**
 * Global query error handler: log to Sentry + (dev) console.
 * Receives error and query (with queryKey, meta) for traceability.
 */
function onQueryError(error: unknown, query: { queryKey: unknown; meta?: unknown }) {
  if (process.env.NODE_ENV === 'development') {
    console.group('🔄 React Query Error');
    console.error('Query failed:', query.queryKey, error);
    console.groupEnd();
  }
  Sentry.captureException(error, {
    tags: { layer: 'ReactQuery', type: 'query' },
    extra: { queryKey: query.queryKey, meta: query.meta },
  });
}

/**
 * QueryClient factory with:
 * - QueryCache.onError: global error logging for all failed queries
 * - defaultOptions.queries: staleTime 1min, retry 1, no refetch on window focus
 * - defaultOptions.mutations: global onError for Sentry (mutations)
 */
function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError,
    }),
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        onError: (error: unknown, _variables: unknown, context: unknown) => {
          if (process.env.NODE_ENV === 'development') {
            console.group('🔄 React Query Mutation Error');
            console.error(error, { context });
            console.groupEnd();
          }
          Sentry.captureException(error, {
            tags: { layer: 'ReactQuery', type: 'mutation' },
            extra: { context },
          });
        },
      },
    },
  });
}

function onError(error: unknown, query: unknown) {
  const q = query as { queryKey?: unknown; meta?: unknown };
  onQueryError(error, { queryKey: q?.queryKey, meta: q?.meta });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Singleton QueryClient for the browser so state is shared across the app.
 * In Next.js App Router we create it once per request on the server and once in the browser.
 */
export function getQueryClient() {
  if (typeof window === 'undefined') {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export { onQueryError };
