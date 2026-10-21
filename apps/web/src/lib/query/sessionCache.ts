import type { QueryClient } from "@tanstack/react-query";

/** The auth store fields that say whose data the query cache holds. */
export interface SessionOwner {
  user?: { id: string } | null;
  isAuthenticated?: boolean;
}

const isSignedIn = (s: SessionOwner) => !!s.isAuthenticated || !!s.user;

/**
 * True when data cached for `prev` must not be shown to `next`: the session
 * ended (logout, expired session, account deletion) or the account changed
 * without a reload (a stale snapshot replaced by another user, a sign-in over
 * an old session). Signing in from a guest session and updates of the same
 * user keep the cache.
 */
export function sessionOwnerChanged(
  prev: SessionOwner,
  next: SessionOwner,
): boolean {
  if (isSignedIn(prev) && !isSignedIn(next)) return true;
  const prevId = prev.user?.id;
  return !!prevId && next.user?.id !== prevId;
}

/**
 * Auth store listener that empties the browser QueryClient whenever the
 * session owner changes. The QueryClient is a tab-wide singleton and sign-out
 * is a soft navigation, so without this the next account in the same tab is
 * served the previous account's cached queries until they refetch. Keyed on
 * the identity, not on a token: tokens live in httpOnly cookies and never
 * reach the store. The client is resolved lazily so the listener works
 * without a mounted QueryProvider (`/logout` renders outside it).
 */
export function clearQueryCacheOnSessionChange(getClient: () => QueryClient) {
  return (state: SessionOwner, prev: SessionOwner) => {
    if (sessionOwnerChanged(prev, state)) getClient().clear();
  };
}

/**
 * A fresh sign-in (not a session restore on reload): drop what was cached as
 * a guest and refetch the mounted queries with the new session, because some
 * responses depend on the viewer (own listings, blocks, test-lane accounts).
 * `resetQueries`, not `clear`: mounted observers refetch instead of holding
 * the guest data. Same rule as mobile (`resetServerStateForNewSession`).
 */
export function resetQueryCacheForNewSession(
  client: QueryClient,
): Promise<void> {
  return client.resetQueries();
}
