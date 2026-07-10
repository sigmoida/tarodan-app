import { useQuery } from '@tanstack/react-query';
import { api, productsApi, categoriesApi, collectionsApi } from '@/lib/api';
import { qk } from '@/lib/query';

/** Anasayfa içerik query'leri — web ile aynı endpoint'ler. */
export function useHomeData() {
  const productsQuery = useQuery({
    queryKey: qk.products.all,
    queryFn: async () => {
      try {
        const response = await productsApi.getAll({ limit: 20 });
        const products = response.data.data || response.data.products || response.data || [];
        return Array.isArray(products) ? products : [];
      } catch (error) {
        console.log('⚠️ Ürünler yüklenemedi:', error);
        return [];
      }
    },
  });

  const boostedQuery = useQuery({
    queryKey: qk.products.boosted,
    queryFn: async () => {
      try {
        const response = await productsApi.getAll({ boostedOnly: true, status: 'active', limit: 12 });
        const list = response.data?.data || response.data?.products || response.data || [];
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    },
  });

  const categoriesQuery = useQuery({
    queryKey: qk.catalog.categories,
    queryFn: async () => {
      try {
        const response = await categoriesApi.getAll();
        const cats = response.data.data || response.data || [];
        return Array.isArray(cats) ? cats : [];
      } catch (error) {
        console.log('⚠️ Kategoriler yüklenemedi:', error);
        return [];
      }
    },
  });

  const collectionsQuery = useQuery({
    queryKey: qk.collections.browse,
    queryFn: async () => {
      try {
        const response = await collectionsApi.browse({ limit: 5 });
        const collections = response.data.data || response.data || [];
        return Array.isArray(collections) ? collections : [];
      } catch {
        console.log('⚠️ Koleksiyonlar yüklenemedi');
        return [];
      }
    },
  });

  const featuredCollectorQuery = useQuery({
    queryKey: qk.products.featuredCollector,
    queryFn: async () => {
      try {
        const response = await api.get('/users/featured-collector');
        return response.data ?? null;
      } catch {
        console.log('⚠️ Haftanın Koleksiyoneri yüklenemedi');
        return null;
      }
    },
  });

  const companyOfWeekQuery = useQuery({
    queryKey: qk.products.featuredBusiness,
    queryFn: async () => {
      try {
        const response = await api.get('/users/featured-business');
        if (response.data) return response.data;
        return null;
      } catch {
        console.log('⚠️ Haftanın Şirketi yüklenemedi, fallback deneniyor');
        try {
          const fallbackResponse = await api.get('/users/top-sellers?limit=1');
          const sellers = fallbackResponse.data?.data || fallbackResponse.data || [];
          if (sellers.length > 0) {
            const sellerId = sellers[0].id;
            const productsResponse = await productsApi.getAll({ sellerId, limit: 6 });
            const products = productsResponse.data?.data || productsResponse.data?.products || [];
            return {
              ...sellers[0],
              products: products.slice(0, 6),
              stats: {
                totalProducts: products.length,
                totalViews: 0,
                totalLikes: 0,
                totalSales: 0,
                averageRating: sellers[0].rating || 0,
                totalRatings: 0,
              },
            };
          }
        } catch {
          console.log('⚠️ Fallback da başarısız');
        }
        return null;
      }
    },
  });

  return {
    products: productsQuery.data ?? [],
    boostedProducts: boostedQuery.data ?? [],
    categories: categoriesQuery.data ?? [],
    collections: collectionsQuery.data ?? [],
    featuredCollector: featuredCollectorQuery.data ?? null,
    companyOfWeek: companyOfWeekQuery.data ?? null,
    loadingProducts: productsQuery.isLoading,
    refetchProducts: productsQuery.refetch,
  };
}
