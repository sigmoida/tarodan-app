import type { QueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query';

/**
 * Beğeni/görüntülenme değişince tüm liste ekranları (home/öne-çıkanlar/arama)
 * tazelensin — TEK kaynak. Hem ürün query hook'u (view sayımı sonrası) hem
 * favori hook'u çağırır.
 */
export function invalidateProductLists(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: qk.products.all });
  queryClient.invalidateQueries({ queryKey: qk.products.searchAll });
  queryClient.invalidateQueries({ queryKey: qk.products.featuredBusiness });
  queryClient.invalidateQueries({ queryKey: qk.products.featuredCollector });
}
