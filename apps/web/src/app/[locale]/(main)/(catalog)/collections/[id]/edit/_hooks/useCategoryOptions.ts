import { useMemo } from "react";
import { categoriesApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";
import { flattenCategories } from "../_lib/constants";

type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  children?: unknown[];
};

const RESOURCE = "categories";

export function useCategoryOptions() {
  const { data: categoriesTree } = useWebList<CategoryNode[]>({
    resource: RESOURCE,
    fetcher: async () => {
      const res = await categoriesApi.findAll();
      return res.data?.data ?? res.data ?? [];
    },
  });
  const flatCategories = useMemo(
    () =>
      Array.isArray(categoriesTree) ? flattenCategories(categoriesTree) : [],
    [categoriesTree],
  );
  return flatCategories;
}
