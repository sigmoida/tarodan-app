import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { extractList } from "@/lib/extract";
import { adminKeys } from "@/lib/query/keys";

export interface CategoryOption {
  id: string;
  name: string;
  slug?: string;
}

/**
 * Shared loader for category options. Collects the repeated
 * `useQuery(['categories-min'])` block used in modal/form selects in one place.
 */
export function useCategories() {
  return useQuery({
    queryKey: adminKeys.all("categories-min"),
    queryFn: async () =>
      extractList<CategoryOption>(await adminApi.getCategories({ limit: 100 })),
  });
}
