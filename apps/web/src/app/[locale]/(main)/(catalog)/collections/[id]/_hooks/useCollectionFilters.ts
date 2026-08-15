/** @format */

"use client";

import { useTranslations } from "next-intl";
import { listingsApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import type { Translate } from "@/types/i18n";

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
const FALLBACK_MATERIALS = (t: Translate): MaterialOption[] => [
  {
    slug: "diecast",
    label: t("page.collections.usecollectionfilters.diecastMetal"),
  },
  {
    slug: "resin",
    label: t("page.collections.usecollectionfilters.resinRecine"),
  },
  {
    slug: "composite",
    label: t("page.collections.usecollectionfilters.compositeKompozit"),
  },
  {
    slug: "plastic",
    label: t("page.collections.usecollectionfilters.plasticPlastik"),
  },
];

const RESOURCE = "collection-item-filters";

/**
 * Brand / manufacturer / scale / material options for the custom-item form.
 * Replaces the old `useEffect` + `useState` fetch; falls back to sensible
 * defaults when the request fails or a facet is empty.
 */
export function useCollectionFilters(enabled: boolean) {
  const t = useTranslations();
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
    materials: data?.materials?.length ? data.materials : FALLBACK_MATERIALS(t),
  };
}
