/** @format */

"use client";

import { listingsApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";

interface FilterOption {
  id: string;
  name: string;
  slug: string;
}
interface MaterialOption {
  slug: string;
  label: string;
}

interface FiltersData {
  scales: string[];
  brands: FilterOption[];
  manufacturers: FilterOption[];
  materials: MaterialOption[];
}

const RESOURCE = "collection-item-filters";

/**
 * Brand / manufacturer / scale / material options for the custom-item form.
 *
 * Options come from the catalog only. This hook used to substitute five scales
 * and four materials whenever a facet came back empty, so a collector could
 * pick a material the catalog does not define — the same fabrication the
 * listing form and the API were doing, in a third place. An empty facet is a
 * fact about the catalog, and the form shows it as such.
 */
export function useCollectionFilters(enabled: boolean) {
  const query = useWebList<Partial<FiltersData>>({
    resource: RESOURCE,
    fetcher: async () => {
      const response = await listingsApi.getFilters();
      return response.data as Partial<FiltersData>;
    },
    enabled,
    query: { staleTime: 5 * 60 * 1000 },
  });

  const data = query.data;
  return {
    scales: data?.scales ?? [],
    brands: data?.brands ?? [],
    manufacturers: data?.manufacturers ?? [],
    materials: data?.materials ?? [],
  };
}
