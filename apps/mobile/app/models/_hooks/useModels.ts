import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { carModelsApi } from '@/services/api';
import { useRefresh } from '@/hooks/useRefresh';
import type { Brand, CarModel } from '../_lib/types';

/**
 * Models-browse controller — owns the car-models query, the search + brand
 * filter state, and the derived brands/filtered/grouped selectors. Lifted
 * verbatim from the monolithic screen (§12).
 */
export function useModels() {
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['car-models'],
    queryFn: async () => {
      const response = await carModelsApi.findAll();
      const items: CarModel[] = (response.data as any) ?? [];
      return Array.isArray(items) ? items : [];
    },
  });

  const { refreshing, onRefresh } = useRefresh(refetch);

  const models = data ?? [];

  const brands = useMemo(() => {
    const map = new Map<string, Brand>();
    models.forEach((m) => {
      if (m.brand && !map.has(m.brand.slug)) map.set(m.brand.slug, m.brand);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [models]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      const matchBrand = selectedBrand === 'all' || m.brand?.slug === selectedBrand;
      const matchSearch =
        !q || m.name.toLowerCase().includes(q) || m.brand?.name?.toLowerCase().includes(q);
      return matchBrand && matchSearch;
    });
  }, [models, search, selectedBrand]);

  const grouped = useMemo(() => {
    const map = new Map<string, { brand: Brand; models: CarModel[] }>();
    filtered.forEach((m) => {
      if (!m.brand) return;
      const slug = m.brand.slug;
      if (!map.has(slug)) {
        map.set(slug, { brand: m.brand, models: [] });
      }
      map.get(slug)!.models.push(m);
    });
    return Array.from(map.values()).sort((a, b) => a.brand.name.localeCompare(b.brand.name));
  }, [filtered]);

  return {
    search,
    setSearch,
    selectedBrand,
    setSelectedBrand,
    isLoading,
    refreshing,
    onRefresh,
    brands,
    grouped,
  };
}

export type ModelsController = ReturnType<typeof useModels>;
