'use client';

import { makeQueryClient, onQueryError } from './query/client';

let browserQueryClient: ReturnType<typeof makeQueryClient> | undefined;

/**
 * QueryClient accessor. On the server, callers should prefer
 * `lib/query/server#getServerQueryClient` (request-scoped); this browser path
 * returns a module-level singleton so cache is shared across the app. The shared
 * config lives in `lib/query/client` so server and browser stay identical.
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

export { makeQueryClient, onQueryError };
