/** @format */

"use client";

import { useCallback, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listingsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import SkeletonCard from "@/components/ui/SkeletonCard";
import type { Product } from "@/types/product";
import HomeProductCard from "./HomeProductCard";

const PAGE_SIZE = 20;

/**
 * The home "Öne Çıkan Ürünler" (Vitrin) rail. SSR seeds the first page (in the
 * crawlable HTML); this then keeps the same LIFO vitrin query going client-side,
 * loading the next page as the user scrolls the strip to the right (infinite
 * horizontal pagination). The section's "Tümünü Gör" link lives in HomeSection.
 */
export default function FeaturedRailClient({
  initialItems,
  sponsoredLabel,
  tradeLabel,
  outOfStockLabel,
}: {
  initialItems: Product[];
  sponsoredLabel: string;
  tradeLabel: string;
  outOfStockLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: queryKeys.home.featuredRail(),
      // Page 1 is the SSR-seeded `initialItems`; continue from page 2.
      initialPageParam: 2,
      queryFn: async ({ pageParam }) => {
        const res = await listingsApi.getAll({
          homeShowcase: true,
          status: "active",
          page: pageParam,
          limit: PAGE_SIZE,
        });
        const body = res.data as {
          data?: Product[];
          products?: Product[];
        } | null;
        const items = body?.data ?? body?.products ?? [];
        return { items, page: pageParam };
      },
      // A short page means we've reached the end of the vitrin list.
      getNextPageParam: (last) =>
        last.items.length < PAGE_SIZE ? undefined : last.page + 1,
      // Only chase more pages when the first (SSR) page was full — otherwise
      // there is nothing after it and we skip the client fetch entirely.
      enabled: initialItems.length >= PAGE_SIZE,
      staleTime: 60_000,
    });

  const seen = new Set(initialItems.map((p) => p.id));
  const more = (data?.pages ?? [])
    .flatMap((p) => p.items)
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  const items = [...initialItems, ...more];

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isFetchingNextPage || !hasNextPage) return;
    // Near the right edge → pull the next page.
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 320) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex gap-3 overflow-x-auto pb-2 px-1 snap-x"
    >
      {items.map((product, index) => (
        <div key={product.id} className="w-40 flex-shrink-0 snap-start">
          <HomeProductCard
            product={product}
            index={index}
            priority={index < 4}
            sponsoredLabel={sponsoredLabel}
            tradeLabel={tradeLabel}
            outOfStockLabel={outOfStockLabel}
          />
        </div>
      ))}
      {isFetchingNextPage &&
        [...Array(3)].map((_, i) => (
          <div key={`sk-${i}`} className="w-40 flex-shrink-0">
            <SkeletonCard />
          </div>
        ))}
    </div>
  );
}
