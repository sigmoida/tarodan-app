'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@tarodan/ui';
import { adminApi } from '@/lib/api';

/**
 * Page-level header subtitle — live total (respecting the active URL filters) +
 * the seller-filter notice. Reads state from the URL (the list syncs filters
 * there via `syncUrl`), so it lives in the page-level PageHeader, outside the
 * ResourceList/SuspenseBoundary — the header stays put while the list swaps.
 */
export function ProductsCountText() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get('status') ?? 'all';
  const search = searchParams.get('q') ?? '';
  const sellerId = searchParams.get('sellerId') ?? '';
  const brandId = searchParams.get('brandId') ?? '';
  const carModelId = searchParams.get('carModelId') ?? '';

  const { data: total } = useQuery({
    queryKey: ['products-count', { status, search, sellerId, brandId, carModelId }],
    queryFn: async () => {
      const res = await adminApi.getProducts({
        page: 1,
        limit: 1,
        ...(search ? { search } : {}),
        ...(status !== 'all' ? { status } : {}),
        ...(sellerId ? { sellerId } : {}),
        ...(brandId ? { brandId } : {}),
        ...(carModelId ? { carModelId } : {}),
      });
      const root = (res.data ?? {}) as any;
      return (root.meta?.total ?? root.total ?? 0) as number;
    },
    staleTime: 30_000,
  });

  const removeSeller = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('sellerId');
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      Toplam {total ?? 0} ürün
      {sellerId && (
        <span className="inline-flex items-center gap-1">
          — Satıcıya göre filtreleniyor
          <Button variant="ghost" size="sm" onClick={removeSeller}>
            Filtreyi kaldır
          </Button>
        </span>
      )}
    </span>
  );
}
