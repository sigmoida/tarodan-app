import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query';

/**
 * Bir teklif mutation'ı başarılı olduğunda geçersiz kılınacak cache kümesi —
 * TEK kaynak. Tüm teklif mutation hook'ları bunu çağırır (manuel refetch yok).
 */
export function useInvalidateOffers() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.offers.all });
    queryClient.invalidateQueries({ queryKey: qk.products.all });
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === 'product',
    });
    queryClient.invalidateQueries({ queryKey: qk.products.listingsAll });
    queryClient.invalidateQueries({ queryKey: qk.products.myListingsAll });
  }, [queryClient]);
}
