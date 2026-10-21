/** @format */

import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { makeQueryClient } from "./client";
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

  it("reaches both paged pickers of my listings by prefix", async () => {
    const client = makeQueryClient();
    // The new-trade picker (per user + target) and the counter offer's own side.
    const newTradeKey = webKeys.infinite(queryKeys.tradeEligible.resource, {
      userId: "u1",
      listingId: "t1",
    });
    const counterMineKey = webKeys.infinite(queryKeys.tradeEligible.resource, {
      userId: "u1",
      picker: "counter",
    });
    const pages = { pages: [], pageParams: [] };
    client.setQueryData(newTradeKey, pages);
    client.setQueryData(counterMineKey, pages);
    await invalidateListingQueries(client);
    expect(client.getQueryState(newTradeKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(counterMineKey)?.isInvalidated).toBe(true);
  });
});
