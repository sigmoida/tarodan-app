'use client';

import { Button } from '@tarodan/ui';
import { useResourceList } from '@/components/list';

/** List header description: total count + active deep-link filter notice. */
export function OrdersSummary() {
  const { total, filters, setFilter, rows } = useResourceList<any>();

  const clearDeepLinkFilter = () =>
    setFilter(filters.productId ? 'productId' : 'userId', '');

  const firstProductTitle = rows[0]?.product?.title as string | undefined;
  const deepLinkFilterLabel = filters.productId
    ? `Ürüne göre filtreleniyor${firstProductTitle ? `: ${firstProductTitle}` : ''}`
    : filters.userId
      ? 'Kullanıcıya göre filtreleniyor'
      : null;

  return (
    <>
      Toplam {total} sipariş
      {deepLinkFilterLabel && (
        <span className="ml-2">
          — {deepLinkFilterLabel}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearDeepLinkFilter}
            className="ml-2 text-primary-600 hover:underline"
          >
            Filtreyi kaldır
          </Button>
        </span>
      )}
    </>
  );
}
