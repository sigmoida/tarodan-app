/** @format */

"use client";

import { api } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";

interface CarModel {
  id: string;
  name: string;
  slug: string;
}

const RESOURCE = "car-models";

/**
 * Car models for the selected brand slug. Replaces the old `useEffect` that
 * fired on every `customBrand` change; the query is disabled until a slug is set.
 */
export function useCarModels(brandSlug: string | undefined) {
  const query = useWebList<CarModel[]>({
    resource: RESOURCE,
    params: brandSlug,
    fetcher: async () => {
      const res = await api.get(`/car-models?brand=${brandSlug}`);
      return Array.isArray(res.data) ? res.data : res.data?.data || [];
    },
    enabled: !!brandSlug,
    query: { staleTime: 5 * 60 * 1000 },
  });

  return {
    models: query.data ?? [],
    isLoading: query.isLoading && !!brandSlug,
  };
}
