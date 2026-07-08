import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { Brand, CarModel } from '../_lib/types';

export function useCarModels(brandId: string, brands: Brand[]) {
  const selectedBrand = brandId ? brands.find(b => b.id === brandId) : undefined;
  const brandSlug = selectedBrand?.slug;
  const enabled = !!brandSlug;

  const query = useQuery({
    queryKey: ['edit-listing-car-models', brandSlug],
    queryFn: async (): Promise<CarModel[]> => {
      try {
        const response = await api.get(`/car-models?brand=${brandSlug}`);
        return Array.isArray(response.data) ? response.data : response.data?.data || [];
      } catch (error) {
        console.error('Failed to fetch models:', error);
        toast.error('Modeller yüklenemedi');
        throw error;
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    models: enabled ? (query.data ?? []) : [],
    modelsLoading: enabled && query.isLoading,
  };
}
