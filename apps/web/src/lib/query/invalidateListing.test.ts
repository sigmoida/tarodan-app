/** @format */

import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateListingQueries } from "./invalidateListing";
import { queryKeys, webKeys } from "./keys";

function keysInvalidatedBy(listingId?: string) {
  const invalidateQueries = vi.fn().mockResolvedValue(undefined);
  void invalidateListingQueries(
    { invalidateQueries } as unknown as QueryClient,
    listingId,
  );
  return invalidateQueries.mock.calls.map((c) => c[0].queryKey);
}

describe("invalidateListingQueries", () => {
  it("refreshes the listing detail, the grids, my listings and the trade picker", () => {
    expect(keysInvalidatedBy("p1")).toEqual([
      queryKeys.product.detail("p1"),
      queryKeys.listings.all(),
      queryKeys.profileListings.all(),
      queryKeys.tradeEligible.all(),
    ]);
  });

  it("skips the detail when there is no listing id yet (create)", () => {
    expect(keysInvalidatedBy()).toEqual([
      queryKeys.listings.all(),
      queryKeys.profileListings.all(),
      queryKeys.tradeEligible.all(),
    ]);
  });

  it("reaches the trade picker's per-user, per-target key by prefix", async () => {
    const client = new QueryClient();
    const pickerKey = webKeys.list(queryKeys.tradeEligible.resource, {
      userId: "u1",
      listingId: "t1",
    });
    client.setQueryData(pickerKey, []);
    await invalidateListingQueries(client);
    expect(client.getQueryState(pickerKey)?.isInvalidated).toBe(true);
  });
});
