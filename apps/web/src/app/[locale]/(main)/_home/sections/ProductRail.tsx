/** @format */

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import SkeletonCard from "@/components/ui/SkeletonCard";
import type { Product } from "@/types/product";
import HomeProductCard from "./HomeProductCard";

/** The default home grid: 2 rows × 6 columns on desktop (12 cards). */
export const HOME_GRID_CLASS =
  "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";

/**
 * The card strip inside a home section — a horizontal `scroll` rail or a
 * responsive `grid`. Frame + header come from `HomeSection`; this only renders
 * the cards / skeletons / empty state. Defaults to the shared 2×6 home grid
 * (12 cards), so every section lays out identically.
 */
export default async function ProductRail({
  items,
  isLoading,
  variant = "grid",
  gridClassName = HOME_GRID_CLASS,
  skeletonCount = 12,
  limit = 12,
  emptyState,
}: {
  items: Product[];
  isLoading: boolean;
  variant?: "scroll" | "grid";
  gridClassName?: string;
  skeletonCount?: number;
  limit?: number;
  emptyState?: ReactNode;
}) {
  const t = await getTranslations();
  const displayItems = limit != null ? items.slice(0, limit) : items;

  if (variant === "scroll") {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 px-1 snap-x">
        {isLoading
          ? [...Array(skeletonCount)].map((_, i) => (
              <div key={i} className="flex-shrink-0 w-40">
                <SkeletonCard />
              </div>
            ))
          : displayItems.map((product, index) => (
              <div key={product.id} className="flex-shrink-0 w-40 snap-start">
                <HomeProductCard
                  product={product}
                  index={index}
                  priority={index < 4}
                  sponsoredLabel={t("product.sponsored")}
                  tradeLabel={t("faq.trade")}
                  outOfStockLabel={t("product.stockFinished")}
                />
              </div>
            ))}
      </div>
    );
  }

  return (
    <div className={`grid ${gridClassName} gap-2`}>
      {isLoading ? (
        [...Array(skeletonCount)].map((_, i) => <SkeletonCard key={i} />)
      ) : emptyState && items.length === 0 ? (
        <div className="col-span-full">{emptyState}</div>
      ) : (
        displayItems.map((product, index) => (
          <HomeProductCard
            key={product.id}
            product={product}
            index={index}
            priority={index < 4}
            sponsoredLabel={t("product.sponsored")}
            tradeLabel={t("faq.trade")}
            outOfStockLabel={t("product.stockFinished")}
          />
        ))
      )}
    </div>
  );
}
