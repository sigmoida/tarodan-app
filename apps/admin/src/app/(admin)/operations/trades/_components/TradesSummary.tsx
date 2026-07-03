'use client';

import { Button } from '@tarodan/ui';
import { useResourceList } from '@/components/list';

export function TradesSummary() {
  const { total, filters, setFilter } = useResourceList<any>();
  const userIdFilter = filters.userId ?? '';

  return (
    <>
      Toplam {total} takas
      {userIdFilter && (
        <span className="ml-2">
          — Kullanıcıya göre filtreleniyor
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilter('userId', '')}
            className="ml-2 text-primary-600 hover:underline"
          >
            Filtreyi kaldır
          </Button>
        </span>
      )}
    </>
  );
}
