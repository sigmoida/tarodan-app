import {
  QueryClient,
  type DefaultOptions,
  type QueryCache,
  type MutationCache,
} from "@tanstack/react-query";

export const PLATFORM_QUERY_DEFAULTS: DefaultOptions = {
  queries: {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  },
};

export interface CreatePlatformQueryClientOptions {
  queryCache?: QueryCache;
  mutationCache?: MutationCache;
  defaultOptions?: DefaultOptions;
}

/** Shared defaults with narrow per-app overrides for web, admin and mobile. */
export function createPlatformQueryClient(
  options: CreatePlatformQueryClientOptions = {},
): QueryClient {
  return new QueryClient({
    queryCache: options.queryCache,
    mutationCache: options.mutationCache,
    defaultOptions: {
      ...PLATFORM_QUERY_DEFAULTS,
      ...options.defaultOptions,
      queries: {
        ...PLATFORM_QUERY_DEFAULTS.queries,
        ...options.defaultOptions?.queries,
      },
      mutations: {
        ...PLATFORM_QUERY_DEFAULTS.mutations,
        ...options.defaultOptions?.mutations,
      },
    },
  });
}
