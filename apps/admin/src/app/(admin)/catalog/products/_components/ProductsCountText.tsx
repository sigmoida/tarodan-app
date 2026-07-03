'use client';

import { Button } from '@tarodan/ui';
import { useResourceList, useFilter } from '@/components/list';

/** Header description — live total (or pending count) + the seller-filter notice. */
export function ProductsCountText() {
  const { rows, total, filters } = useResourceList<any>();
  const [sellerId, setSellerId] = useFilter('sellerId');
  const pending = rows.filter((r) => r.status === 'pending').length;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {filters.status === 'pending' ? `${pending} ürün onay bekliyor` : `Toplam ${total} ürün`}
      {sellerId && (
        <span className="inline-flex items-center gap-1">
          — Satıcıya göre filtreleniyor
          <Button variant="ghost" size="sm" onClick={() => setSellerId('')}>
            Filtreyi kaldır
          </Button>
        </span>
      )}
    </span>
  );
}
