"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { listingsApi } from "@/lib/api";
import type { AttributeGroup } from "@tarodan/listing-form";

/**
 * A custom attribute group: general (no manufacturer, on every listing) or
 * bound to a manufacturer; the same shape as `/products/attribute-groups`,
 * reusing the listing-form package type. Without a manufacturer,
 * `/products/filters` returns only the general groups.
 */
export type CustomAttributeGroup = AttributeGroup;

/** The `/products/filters` answer: the catalog metadata the filters read. */
export interface FiltersData {
  scales?: string[];
  materials?: Array<{ slug: string; label: string }>;
  colors?: Array<{ slug: string; label: string; color?: string | null }>;
  brands?: Array<string | { id: string; name: string; slug: string }>;
  carModels?: Array<{
    id: string;
    name: string;
    slug: string;
    brandId: string;
  }>;
  customAttributes?: CustomAttributeGroup[];
}

/** Catalog metadata is treated as fixed for the session. */
const STALE = 60 * 60 * 1000;

/**
 * The filter metadata: the ONE query definition.
 *
 * The listings sidebar (lists the options), the active-filter chips and the
 * saved-search cards (turn a selected slug into its label) all read it. They
 * share the `queryKey`, so they make one request; a second copy of the
 * definition would silently send a second request once its `staleTime`
 * drifted.
 */
export function useListingFiltersQuery({ enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.listings.filters(),
    queryFn: async () => (await listingsApi.getFilters()).data as FiltersData,
    staleTime: STALE,
    enabled,
  });
}
