/** @format */

"use client";

import { useCallback, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { listingsApi } from "@/lib/api";
import { queryKeys } from "@/lib/query/keys";
import SkeletonCard from "@/components/ui/SkeletonCard";
import type { ProductBadgeLabels } from "@/lib/productCardBadges";
import { unwrapList } from "@/lib/unwrapList";
import type { Product } from "@/types/product";
import { useHomeRail } from "../_hooks/useHomeRail";
import { HOME_RAIL_QUERIES, type HomeRailSeed } from "../lib/rails";
import HomeProductCard from "./HomeProductCard";

const { params: FIRST_PAGE } = HOME_RAIL_QUERIES.featured;
const PAGE_SIZE = FIRST_PAGE.limit;

/**
 * The home featured (showcase) rail. SSR seeds the first page (in the
 * crawlable HTML); when the server fetch failed (`null` seed) the first page
 * loads in the browser (`useHomeRail`). It then keeps the same LIFO showcase
 * query going client-side, loading the next page as the user scrolls the strip
 * to the right (infinite horizontal pagination). The section's "view all" link
 * lives in HomeSection.
 */
export default function FeaturedRailClient({
  initialItems,
  badgeLabels,
  outOfStockLabel,
}: {
  initialItems: HomeRailSeed;
  badgeLabels: ProductBadgeLabels;
  outOfStockLabel: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstPage = useHomeRail("featured", initialItems) ?? [];

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: queryKeys.home.featuredRail(),
      // Page 1 is `firstPage`; continue from page 2.
      initialPageParam: FIRST_PAGE.page + 1,
      queryFn: async ({ pageParam }) => {
        const res = await listingsApi.getAll({
          ...FIRST_PAGE,
          page: pageParam,
        });
        return { items: unwrapList<Product>(res.data), page: pageParam };
      },
      // A short page means we've reached the end of the vitrin list.
      getNextPageParam: (last) =>
        last.items.length < PAGE_SIZE ? undefined : last.page + 1,
      // Only chase more pages when the first page was full; otherwise there
      // is nothing after it and we skip the client fetch entirely.
      enabled: firstPage.length >= PAGE_SIZE,
      staleTime: 60_000,
    });

  const seen = new Set(firstPage.map((p) => p.id));
  const more = (data?.pages ?? [])
    .flatMap((p) => p.items)
    .filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  const items = [...firstPage, ...more];

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
            badgeLabels={badgeLabels}
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
