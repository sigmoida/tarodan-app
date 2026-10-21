import { notifyManager, type QueryClient } from "@tanstack/react-query";

/** The auth store fields that say whose data the query cache holds. */
export interface SessionOwner {
  user?: { id: string } | null;
  isAuthenticated?: boolean;
  /** True while the store has not yet resolved who the visitor is. */
  isLoading?: boolean;
}

/**
 * - `ended`: a signed-in session became a guest (logout, expired session,
 *   account deletion).
 * - `switched`: another account replaced the user without a reload (a stale
 *   snapshot replaced by the real profile, a sign-in over an old session).
 * - `signedIn`: a visitor known to be a guest signed in, in this tab or in
 *   another one that `checkAuth` picked up.
 */
export type SessionChange = "ended" | "switched" | "signedIn";

const isSignedIn = (s: SessionOwner) => !!s.isAuthenticated || !!s.user;

/**
 * Classifies one auth store update. `wasGuest` says the visitor had been
 * resolved as a guest before `prev`; without it a guest-to-user step is the
 * session restore of a page load, whose server-seeded cache already belongs
 * to that user and is kept.
 */
export function sessionChange(
  prev: SessionOwner,
  next: SessionOwner,
  wasGuest: boolean,
): SessionChange | null {
  if (isSignedIn(prev) && !isSignedIn(next)) return "ended";
  const prevId = prev.user?.id;
  if (prevId && next.user?.id !== prevId) return "switched";
  if (wasGuest && !isSignedIn(prev) && isSignedIn(next)) return "signedIn";
  return null;
}

/**
 * Drops every cached query. `clear()` alone removes queries without telling
 * their mounted observers, so a component that stays mounted would keep
 * rendering the old data, and a fetch started before the change could still
 * land in it. Resetting each query first cancels its fetch and pushes the
 * empty state to its observers, which refetch on their next render with the
 * new session (and their new `enabled`).
 */
function dropQueries(client: QueryClient): void {
  notifyManager.batch(() => {
    for (const query of client.getQueryCache().getAll()) query.reset();
  });
  client.getQueryCache().clear();
}

/**
 * Auth store listener that keeps the browser QueryClient with the session
 * owner. The QueryClient is a tab-wide singleton and sign-out and sign-in
 * are soft navigations, so without this one account's cached queries are
 * served to the next visitor in the same tab until they refetch. On `ended`
 * and `switched` the mutation cache (the old user's form variables) goes
 * too; on `signedIn` only the guest-shaped queries do, so a mutation started
 * as a guest still settles. Keyed on the identity, not on a token: tokens
 * live in httpOnly cookies and never reach the store. The client is resolved
 * lazily so the listener works without a mounted QueryProvider (`/logout`
 * renders outside it).
 */
export function syncQueryCacheWithSession(
  getClient: () => QueryClient,
  initial: SessionOwner,
) {
  let wasGuest = !isSignedIn(initial) && !initial.isLoading;
  return (state: SessionOwner, prev: SessionOwner) => {
    const change = sessionChange(prev, state, wasGuest);
    if (change) {
      const client = getClient();
      dropQueries(client);
      if (change !== "signedIn") client.getMutationCache().clear();
    }
    if (isSignedIn(state)) wasGuest = false;
    else if (!state.isLoading) wasGuest = true;
  };
}
