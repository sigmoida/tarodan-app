/**
 * Web SidebarFilters'ın yaptığı gibi /products/filters + /categories'ten filtre
 * seçeneklerini yükler. Tüm filtre ekranları bu hook'u paylaşır.
 */
import { useQuery } from '@tanstack/react-query';
import { productsApi, categoriesApi } from '../services/api';
import { MATERIAL_FALLBACK, SCALE_FALLBACK } from '../utils/productFilters';

export type FilterCategory = { id: string; name: string; slug: string };
export type FilterBrand = { id: string; name: string; slug: string };
export type FilterManufacturer = { id: string; name: string; slug: string };
export type FilterCarModel = { id: string; name: string; slug: string; brandId: string };
export type FilterMaterial = { slug: string; label: string };

export type ProductFilterOptions = {
  categories: FilterCategory[];
  brands: FilterBrand[];
  manufacturers: FilterManufacturer[];
  carModels: FilterCarModel[];
  scales: string[];
  materials: FilterMaterial[];
  isLoading: boolean;
};

export function useProductFilterOptions(): ProductFilterOptions {
  const filtersQuery = useQuery({
    queryKey: ['product-filters'],
    queryFn: async () => {
      const res = await productsApi.getFilters();
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
  });

  const categoriesQuery = useQuery({
    queryKey: ['filter-categories'],
    queryFn: async () => {
      const res = await categoriesApi.getAll();
      const raw = res.data as any;
      const list = Array.isArray(raw) ? raw : raw?.data ?? [];
      return list as Array<{ id: string; name: string; slug: string }>;
    },
    staleTime: 10 * 60 * 1000,
  });

  const data = filtersQuery.data;

  // /products/filters categories: { value, label, slug } → { id, name, slug }
  const categoriesFromFilters: FilterCategory[] = (data?.categories ?? []).map((c) => ({
    id: c.value,
    name: c.label,
    slug: c.slug,
  }));

  const categories: FilterCategory[] =
    categoriesQuery.data && categoriesQuery.data.length > 0
      ? categoriesQuery.data.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))
      : categoriesFromFilters;

  return {
    categories,
    brands: data?.brands ?? [],
    manufacturers: data?.manufacturers ?? [],
    carModels: data?.carModels ?? [],
    scales: data?.scales && data.scales.length > 0 ? data.scales : SCALE_FALLBACK,
    materials: data?.materials && data.materials.length > 0 ? data.materials : MATERIAL_FALLBACK,
    isLoading: filtersQuery.isLoading,
  };
}
