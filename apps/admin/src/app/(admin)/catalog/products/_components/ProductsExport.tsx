'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@tarodan/ui';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';

/** CSV export of the current product filters (reads status/sellerId from the URL). */
export function ProductsExport() {
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);

  const status = searchParams.get('status') ?? 'all';
  const sellerId = searchParams.get('sellerId') ?? '';

  const onExport = async () => {
    setBusy(true);
    try {
      const res = await adminApi.exportProducts({
        status: status === 'all' ? undefined : status,
        sellerId: sellerId || undefined,
      });
      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: 'text/csv' }),
      );
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
      leftIcon={<ArrowDownTrayIcon className='h-5 w-5' />}
      isLoading={busy}
      onClick={onExport}>
      CSV İndir
    </Button>
  );
}
