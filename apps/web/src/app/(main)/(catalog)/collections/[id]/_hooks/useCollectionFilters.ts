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

const FALLBACK_SCALES = ["1:18", "1:24", "1:43", "1:64", "1:87"];
const FALLBACK_MATERIALS: MaterialOption[] = [
  { slug: "diecast", label: "Diecast (Metal)" },
  { slug: "resin", label: "Resin (Reçine)" },
  { slug: "composite", label: "Composite (Kompozit)" },
  { slug: "plastic", label: "Plastic (Plastik)" },
];

const RESOURCE = "collection-item-filters";

/**
 * Brand / manufacturer / scale / material options for the custom-item form.
 * Replaces the old `useEffect` + `useState` fetch; falls back to sensible
 * defaults when the request fails or a facet is empty.
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
    scales: data?.scales?.length ? data.scales : FALLBACK_SCALES,
    brands: data?.brands ?? [],
    manufacturers: data?.manufacturers ?? [],
    materials: data?.materials?.length ? data.materials : FALLBACK_MATERIALS,
  };
}
