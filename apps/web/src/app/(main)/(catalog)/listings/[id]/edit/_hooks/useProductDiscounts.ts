import { useQuery } from '@tanstack/react-query';
import { discountsApi } from '@/lib/api';

interface UseProductDiscountsParams {
  id: string;
  authLoading: boolean;
  isAuthenticated: boolean;
}

export function useProductDiscounts({ id, authLoading, isAuthenticated }: UseProductDiscountsParams) {
  const enabled = !authLoading && isAuthenticated;

  const query = useQuery({
    queryKey: ['edit-listing-product-discounts', id],
    queryFn: async (): Promise<any[]> => {
      try {
        const response = await discountsApi.getAll({ limit: 100 });
        const allDiscounts = response.data?.items || response.data || [];
        // Filter discounts that target this product
        return allDiscounts.filter((d: any) =>
          d.scope === 'product' && d.targetProductIds?.includes(id)
        );
      } catch (error) {
        console.error('Failed to fetch product discounts:', error);
        return [];
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  return { productDiscounts: query.data ?? [] };
}
