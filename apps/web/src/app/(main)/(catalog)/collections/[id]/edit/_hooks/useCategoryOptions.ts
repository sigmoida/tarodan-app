import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { categoriesApi } from '@/lib/api';
import { flattenCategories } from '../_lib/constants';

export function useCategoryOptions() {
  const { data: categoriesTree } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await categoriesApi.findAll();
      return res.data?.data ?? res.data ?? [];
    },
  });
  const flatCategories = useMemo(
    () => (Array.isArray(categoriesTree) ? flattenCategories(categoriesTree) : []),
    [categoriesTree],
  );
  return flatCategories;
}
