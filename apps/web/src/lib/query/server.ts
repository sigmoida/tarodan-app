import 'server-only';

import { cache } from 'react';
import { makeQueryClient } from './client';

/**
 * The request-scoped server QueryClient. `cache()` makes it **one client per
 * request render** (multiple prefetch callers in the same page share it, and
 * nothing leaks across requests). Use it to `prefetchQuery` on the server, then
 * `dehydrate(getServerQueryClient())` into a <HydrationBoundary> so the first
 * paint ships the data and the client takes over the same cache — no refetch flash.
 */
export const getServerQueryClient = cache(() => makeQueryClient());
