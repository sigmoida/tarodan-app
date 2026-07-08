import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { listingsApi, api, brandsApi } from '@/lib/api';
import { useTranslation } from '@/i18n';
import type { Category, Brand } from '../_lib/types';

interface UseListingFiltersParams {
  id: string;
  authLoading: boolean;
  isAuthenticated: boolean;
}

type Ref = { id: string; name: string; slug: string };

const flattenCategories = (cats: Category[]): Category[] => {
  const result: Category[] = [];
  cats.forEach(cat => {
    result.push(cat);
    if (cat.children && cat.children.length > 0) {
      result.push(...flattenCategories(cat.children));
    }
  });
  return result;
};

export function useListingFilters({ id, authLoading, isAuthenticated }: UseListingFiltersParams) {
  const { locale } = useTranslation();
  const enabled = !authLoading && isAuthenticated;

  const filtersQuery = useQuery({
    queryKey: ['edit-listing-filters'],
    queryFn: async () => {
      const brandsFallback = async (): Promise<Brand[]> => {
        try {
          const brandsRes = await brandsApi.findAll();
          const raw = brandsRes.data;
          const list = Array.isArray(raw) ? raw : (raw as { data?: unknown[] })?.data || [];
          return list as Brand[];
        } catch {
          return [];
        }
      };
      try {
        const response = await listingsApi.getFilters();
        const data = response.data as {
          scales?: string[];
          materials?: Array<{ slug: string; label: string }>;
          brands?: Ref[];
          manufacturers?: Ref[];
        };
        let brands: Brand[] = data.brands?.length ? (data.brands as Brand[]) : [];
        if (!data.brands?.length) {
          const fallback = await brandsFallback();
          if (fallback.length) brands = fallback;
        }
        return {
          scaleList: data.scales?.length ? data.scales : [],
          materialList: data.materials?.length ? data.materials : [],
          brands,
          manufacturerList: data.manufacturers?.length ? data.manufacturers : [],
        };
      } catch {
        const brands = await brandsFallback();
        toast.error(locale === 'en' ? 'Failed to load filters' : 'Filtreler yüklenemedi');
        return { scaleList: [], materialList: [], brands, manufacturerList: [] };
      }
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const categoriesQuery = useQuery({
    queryKey: ['edit-listing-categories', id],
    queryFn: async (): Promise<Category[]> => {
      const response = await api.get('/categories');
      return response.data.data || response.data || [];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const flatCategories = flattenCategories(categoriesQuery.data ?? []);

  return {
    brands: filtersQuery.data?.brands ?? [],
    brandsLoading: filtersQuery.isPending,
    scaleList: filtersQuery.data?.scaleList ?? [],
    materialList: filtersQuery.data?.materialList ?? [],
    manufacturerList: filtersQuery.data?.manufacturerList ?? [],
    flatCategories,
  };
}
