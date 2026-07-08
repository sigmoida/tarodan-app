'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/api';
import { userFilterParams } from '../_lib/types';

/**
 * Page-level header subtitle — live total respecting the active URL filters, so
 * it lives in the stable page-level PageHeader (outside the list boundary).
 */
export function UsersSummary() {
  const searchParams = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const filter = searchParams.get('filter') ?? 'all';

  const { data: total } = useQuery({
    queryKey: ['users-count', { search, filter }],
    queryFn: async () => {
      const res = await adminApi.getUsers({
        page: 1,
        limit: 1,
        ...(search ? { search } : {}),
        ...userFilterParams(filter),
      });
      const root = (res.data ?? {}) as any;
      return (root.meta?.total ?? root.total ?? 0) as number;
    },
    staleTime: 30_000,
  });

  return <>Toplam {total ?? 0} kullanıcı</>;
}
