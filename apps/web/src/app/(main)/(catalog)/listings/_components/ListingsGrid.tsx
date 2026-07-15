/** @format */

"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { ProductCard } from "@/components/ui";
import { useListings } from "../_context/ListingsContext";

// Two views only: a responsive grid (up to 4 columns) or a stacked list. The
// ProductCard is fluid, so the grid just sets the column count.
const GRID_CLASS =
  "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4";

const getGridClass = (productLayout: string) =>
  productLayout === "list" ? "space-y-2" : GRID_CLASS;

/**
 * The ProductCard grid/list, the loading skeleton and the empty state.
 * ProductCard self-derives its image, so no local image helper is needed.
 */
export default function ListingsGrid() {
  const t = useTranslations();
  const {
    productLayout,
    isLoading,
    listings,
    activeFilterCount,
    clearFilters,
  } = useListings();

  if (isLoading) {
    return (
      <div className={getGridClass(productLayout)}>
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="bg-surface-elevated rounded border border-border-subtle overflow-hidden animate-pulse"
          >
            <div className="aspect-square bg-border-subtle" />
            <div className="p-3 space-y-2">
              <div className="h-3 bg-border-subtle rounded w-3/4" />
              <div className="h-3 bg-border-subtle rounded w-1/2" />
              <div className="h-4 bg-border-subtle rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="text-center py-20 bg-surface-elevated rounded border border-border">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-surface rounded mb-4">
          <MagnifyingGlassIcon className="w-7 h-7 text-subtle" />
        </div>
        <p className="text-muted text-lg font-medium mb-1">
          {t("product.noListings")}
        </p>
        <p className="text-subtle text-sm mb-4">
          {t("product.tryAdjustingFilters")}
        </p>
        {activeFilterCount > 0 && (
          <Button variant="primary" size="md" onClick={clearFilters}>
            {t("product.clearFilters")}
          </Button>
        )}
      </div>
    );
  }

  if (productLayout === "list") {
    return (
      <div className="space-y-4">
        {listings.map((listing, index) => (
          <ProductCard
            key={listing.id}
            product={listing}
            layout="list"
            index={index}
            priority={index === 0}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={getGridClass(productLayout)}>
      {listings.map((listing, index) => (
        <ProductCard
          key={listing.id}
          product={listing}
          layout="grid"
          index={index}
          priority={index < 4}
        />
      ))}
    </div>
  );
}
