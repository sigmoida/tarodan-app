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

interface ReportableError {
  name?: string;
  code?: string;
  message?: unknown;
  response?: { status?: unknown };
  config?: { url?: unknown; method?: unknown };
}

/** HTTP status of an axios-style error; `undefined` for network/runtime errors. */
function httpStatusOf(error: unknown): number | undefined {
  const status = (error as ReportableError)?.response?.status;
  return typeof status === "number" ? status : undefined;
}

/**
 * Should this mutation failure go to Sentry?
 *
 * - `meta: { reportError: false }` opts a mutation out entirely.
 * - Cancellations (`AbortError`, axios `ERR_CANCELED`) are not failures.
 * - A 4xx is the API answering the user's input (wrong password, OTP, coupon
 *   or stock rejection, 409 conflict, …) — expected, shown as a toast, and
 *   reporting it would burn the Sentry quota. 429 is the exception: being
 *   rate-limited is worth seeing.
 * - Network errors (no status) and 5xx are reported.
 */
export function shouldReportMutationError(
  error: unknown,
  meta?: Record<string, unknown>,
): boolean {
  if (meta?.reportError === false) return false;
  const err = error as ReportableError;
  if (err?.name === "AbortError" || err?.code === "ERR_CANCELED") return false;
  const status = httpStatusOf(error);
  if (status !== undefined && status < 500 && status !== 429) return false;
  return true;
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
 * Only SAFE fields go into the event: the mutation key, HTTP status, method
 * and endpoint path (query string stripped). The mutation's variables, its
 * `onMutate` snapshot (`context`) and `meta` are never sent — they can carry
 * personal data (addresses, cart contents, form input).
 */
export function onMutationError(
  error: unknown,
  mutation: { mutationKey?: unknown; meta?: Record<string, unknown> },
) {
  if (!shouldReportMutationError(error, mutation.meta)) return;
  const config = (error as ReportableError)?.config;
  const url = typeof config?.url === "string" ? config.url : undefined;
  logger.captureException(error, {
    source: "react-query",
    type: "mutation",
    mutationKey: mutation.mutationKey,
    status: httpStatusOf(error),
    method:
      typeof config?.method === "string"
        ? config.method.toUpperCase()
        : undefined,
    endpoint: url?.split("?")[0],
  });
}

export function makeQueryClient() {
  return createPlatformQueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        onMutationError(error, {
          mutationKey: mutation.options.mutationKey,
          meta: mutation.meta,
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
