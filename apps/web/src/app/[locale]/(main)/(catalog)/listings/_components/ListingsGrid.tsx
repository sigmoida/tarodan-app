/** @format */

"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Button, EmptyState } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import InlineAdSlot from "@/components/marketing/InlineAdSlot";
import { ProductCard } from "@/components/ui";
import { isInlineAdSlotAfter } from "@/lib/ads/inlinePlacement";
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
      <EmptyState
        icon={<MagnifyingGlassIcon className="h-7 w-7" />}
        title={t("product.noListings")}
        // With no filter applied the catalog is simply empty: invite a
        // listing instead of blaming a filter that does not exist.
        description={
          activeFilterCount > 0
            ? t("product.tryAdjustingFilters")
            : t("home.beTheFirst")
        }
        action={
          activeFilterCount > 0 ? (
            <Button variant="primary" size="md" onClick={clearFilters}>
              {t("product.clearFilters")}
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (productLayout === "list") {
    return (
      <div className="space-y-4">
        {listings.map((listing, index) => (
          <Fragment key={listing.id}>
            <ProductCard
              product={listing}
              layout="list"
              index={index}
              priority={index === 0}
            />
            <AdAfterCard index={index} />
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className={getGridClass(productLayout)}>
      {listings.map((listing, index) => (
        <Fragment key={listing.id}>
          <ProductCard
            product={listing}
            layout="grid"
            index={index}
            priority={index < 4}
          />
          <AdAfterCard index={index} />
        </Fragment>
      ))}
    </div>
  );
}

/** Admin'in "inline" afişi: 8. karttan sonra, listede tek kez. */
function AdAfterCard({ index }: { index: number }) {
  return isInlineAdSlotAfter(index) ? <InlineAdSlot /> : null;
}
