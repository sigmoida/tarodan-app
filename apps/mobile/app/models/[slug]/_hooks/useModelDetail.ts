import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CONDITIONS } from '@/theme';
import { carModelsApi, productsApi } from '@/lib/api';
import { transformImageUrl } from '@/utils/imageUrl';
import { useRefresh } from '@/hooks/useRefresh';
import type { CarModelDetail, Product } from '../_lib/types';

/**
 * Model-detail controller — owns the car-model query + its products query,
 * pull-to-refresh, and the image/condition helpers. Lifted verbatim from the
 * monolithic screen (§12).
 */
export function useModelDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const slugStr = String(slug ?? '');

  const modelQuery = useQuery({
    queryKey: ['car-model', slugStr],
    queryFn: async () => {
      const response = await carModelsApi.findBySlug(slugStr);
      return (response.data as any) as CarModelDetail | null;
    },
    enabled: !!slugStr,
  });

  const productsQuery = useQuery({
    queryKey: ['model-products', slugStr],
    queryFn: async () => {
      try {
        const response = await productsApi.getAll({ carModel: slugStr, limit: 50 });
        const data: any = response.data;
        const items: Product[] = data?.items ?? data?.data ?? data ?? [];
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    },
    enabled: !!slugStr,
  });

  const { refreshing, onRefresh } = useRefresh(modelQuery.refetch, productsQuery.refetch);

  const model = modelQuery.data;
  const products = productsQuery.data ?? [];

  const getImageUri = (p: Product) => {
    const first = p.images?.[0];
    if (!first) return undefined;
    const url = typeof first === 'string' ? first : first.url;
    return transformImageUrl(url);
  };

  const conditionLabel = (c?: string) => CONDITIONS.find((x) => x.id === c)?.name ?? c ?? '';

  return {
    modelQuery,
    productsQuery,
    model,
    products,
    refreshing,
    onRefresh,
    getImageUri,
    conditionLabel,
  };
}

export type ModelDetailController = ReturnType<typeof useModelDetail>;
