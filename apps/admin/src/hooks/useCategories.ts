import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { extractList } from '@/lib/extract';

export interface CategoryOption {
  id: string;
  name: string;
}

/**
 * Kategori seçimleri için ortak yükleyici. Modal/form select'lerinde tekrar eden
 * `useQuery(['categories-min'])` bloğunu tek yerde toplar.
 */
export function useCategories() {
  return useQuery({
    queryKey: ['categories-min'],
    queryFn: async () => extractList<CategoryOption>(await adminApi.getCategories()),
  });
}
