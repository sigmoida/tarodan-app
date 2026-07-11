import { useQuery } from '@tanstack/react-query';
import { ratingsApi } from '@/lib/api';
import { qk } from '@/lib/query';
import type { ProductReview } from '../_lib/types';

/** GET /ratings/products/:id (web ile parite). */
export function useProductReviews(productId: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.products.reviews(productId),
    enabled,
    queryFn: async (): Promise<ProductReview[]> => {
      try {
        const response = await ratingsApi.getProductRatings(productId);
        const data: any = response.data;
        return data?.ratings ?? data?.items ?? data?.data ?? (Array.isArray(data) ? data : []);
      } catch {
        return [];
      }
    },
  });
}
