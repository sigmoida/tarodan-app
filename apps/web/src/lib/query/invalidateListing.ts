/** @format */

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";

/**
 * The queries that go stale when the user creates, edits or changes the status
 * of one of their listings: ONE list for every listing write that does not go
 * through `useWebMutation({ invalidates })`. Pass the listing id when there is
 * one, so its public detail page refreshes too.
 *
 * The edit form's own `listingEdit` query is left out on purpose: it seeds the
 * form, and refetching it under an open form would reset unsaved edits.
 */
export function invalidateListingQueries(
  queryClient: QueryClient,
  listingId?: string,
) {
  return Promise.all([
    ...(listingId
      ? [
          queryClient.invalidateQueries({
            queryKey: queryKeys.product.detail(listingId),
          }),
        ]
      : []),
    queryClient.invalidateQueries({ queryKey: queryKeys.listings.all() }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.profileListings.all(),
    }),
    queryClient.invalidateQueries({ queryKey: queryKeys.tradeEligible.all() }),
  ]);
}
