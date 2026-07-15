/** @format */

"use client";

import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { ListingsProvider, useListings } from "./_context/ListingsContext";
import ListingsControls, {
  ActiveFilterChips,
} from "./_components/ListingsToolbar";
import ListingsSidebar from "./_components/ListingsSidebar";
import ListingsGrid from "./_components/ListingsGrid";
import ListingsPagination from "./_components/ListingsPagination";

function ListingsLayout() {
  const t = useTranslations();
  const { filters, currentSearch, pagination } = useListings();

  const title = currentSearch
    ? t("product.searchResultsFor", { query: currentSearch })
    : filters.brand || filters.category || t("seller.allListings");
  const description = `${pagination.total} ${t("product.productsFound")}`;

  return (
    <PageShell>
      <PageHeader
        title={title}
        description={description}
        actions={<ListingsControls />}
      />

      <div className="flex gap-4">
        {/* Sidebar Filters (Desktop + Mobile drawer) */}
        <ListingsSidebar />

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          <ActiveFilterChips />
          <ListingsGrid />
          <ListingsPagination />
        </div>
      </div>
    </PageShell>
  );
}

export default function ListingsClient() {
  return (
    <ListingsProvider>
      <ListingsLayout />
    </ListingsProvider>
  );
}
