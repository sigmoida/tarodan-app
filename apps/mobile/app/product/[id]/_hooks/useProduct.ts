import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '@/lib/api';
import { qk } from '@/lib/query';
import { invalidateProductLists } from '../_lib/invalidate';
import type { Product } from '../_lib/types';

/**
 * GET /products/:id (web ile parite). Ürünü çektikten sonra görüntülenmeyi
 * ürün başına 1 kez sayar (POST /products/:id/view) ve liste ekranlarını
 * tazeler. Public endpoint pending/rejected/inactive ilanları 404 döndürür;
 * kullanıcı giriş yapmışsa sahibe-özel endpoint'e (GET /products/my/:id) düşer.
 */
export function useProduct(productId: string, isAuthenticated: boolean) {
  const queryClient = useQueryClient();

  // Görüntülenme sayacı ürün başına 1 kez artırılır.
  const viewCountedRef = useRef(false);
  useEffect(() => {
    viewCountedRef.current = false;
  }, [productId]);

  return useQuery({
    queryKey: qk.products.detail(productId),
    retry: 1,
    queryFn: async (): Promise<Product | null> => {
      try {
        const response = await productsApi.getOne(productId);
        const product = response.data.data || response.data;
        if (product && !viewCountedRef.current) {
          viewCountedRef.current = true;
          try {
            const viewResp: any = await productsApi.incrementView(productId);
            const vc = viewResp?.data?.viewCount ?? viewResp?.data?.data?.viewCount;
            if (vc !== undefined) product.viewCount = vc;
            invalidateProductLists(queryClient);
          } catch {
            // görüntülenme sayımı kritik değil — yoksay
          }
        }
        return product;
      } catch (error) {
        // Sahibi giriş yapmışsa kendi ilanı olabilir; sahibe-özel endpoint her
        // statüde döner (görüntülenme sayılmaz — kendi ilanı).
        if (isAuthenticated) {
          try {
            const mineResp = await productsApi.getMyById(productId);
            return mineResp.data.data || mineResp.data;
          } catch {
            // sahibi değil ya da gerçekten yok
          }
        }
        console.log('⚠️ Ürün detayı yüklenemedi');
        return null;
      }
    },
  });
}
