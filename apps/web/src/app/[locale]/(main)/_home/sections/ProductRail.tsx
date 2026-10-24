/** @format */

import type { ReactNode } from "react";
import type { ProductBadgeLabels } from "@/lib/productCardBadges";
import type { Product } from "@/types/product";
import HomeProductCard from "./HomeProductCard";

/** The home grid: 2 rows x 6 columns on desktop. */
const HOME_GRID_CLASS =
  "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";
const HOME_GRID_LIMIT = 12;

/**
 * The card grid inside a home section; frame and header come from
 * `HomeSection`. Synchronous and free of server-only imports, so the
 * server-seeded rail and the client-loaded rail (`HomeRailClient`) render the
 * same markup. Labels come in as props.
 */
export default function ProductRail({
  items,
  emptyState,
  badgeLabels,
  outOfStockLabel,
}: {
  items: Product[];
  emptyState?: ReactNode;
  badgeLabels: ProductBadgeLabels;
  outOfStockLabel: string;
}) {
  return (
    <div className={`grid ${HOME_GRID_CLASS} gap-2`}>
      {emptyState && items.length === 0 ? (
        <div className="col-span-full">{emptyState}</div>
      ) : (
        items
          .slice(0, HOME_GRID_LIMIT)
          .map((product, index) => (
            <HomeProductCard
              key={product.id}
              product={product}
              index={index}
              priority={index < 4}
              badgeLabels={badgeLabels}
              outOfStockLabel={outOfStockLabel}
            />
          ))
      )}
    </div>
  );
}
