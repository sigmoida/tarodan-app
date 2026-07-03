'use client';

import { useState } from 'react';
import { Button } from '@tarodan/ui';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { useResourceList } from '@/components/list';

/** CSV export of the current product filters (reads status/sellerId from context). */
export function ProductsExport() {
  const { filters } = useResourceList<any>();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    try {
      const res = await adminApi.exportProducts({
        status: filters.status === 'all' ? undefined : filters.status,
        sellerId: filters.sellerId || undefined,
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `products_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="secondary"
      leftIcon={<ArrowDownTrayIcon className="h-5 w-5" />}
      isLoading={busy}
      onClick={onExport}
    >
      CSV İndir
    </Button>
  );
}
