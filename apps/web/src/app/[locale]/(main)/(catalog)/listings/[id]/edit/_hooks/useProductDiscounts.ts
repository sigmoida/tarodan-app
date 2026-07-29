import { discountsApi } from "@/lib/api";
import { useWebList } from "@/hooks/useWebResource";

interface UseProductDiscountsParams {
  id: string;
  authLoading: boolean;
  isAuthenticated: boolean;
}

export function useProductDiscounts({
  id,
  authLoading,
  isAuthenticated,
}: UseProductDiscountsParams) {
  const enabled = !authLoading && isAuthenticated;

  const query = useWebList<any[]>({
    resource: "edit-listing-product-discounts",
    params: id,
    fetcher: async () => {
      try {
        const response = await discountsApi.getAll({ limit: 100 });
        const allDiscounts = response.data?.items || response.data || [];
        // Filter discounts that target this product
        return allDiscounts.filter(
          (d: any) => d.scope === "product" && d.targetProductIds?.includes(id),
        );
      } catch (error) {
        console.error("Failed to fetch product discounts:", error);
        return [];
      }
    },
    enabled,
    query: { staleTime: 5 * 60 * 1000 },
  });

  return { productDiscounts: query.data ?? [] };
}
