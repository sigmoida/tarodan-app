'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@tarodan/ui';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';

/** CSV export of the current transaction filters (read from the URL). */
export function PayoutsExport() {
  const sp = useSearchParams();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    try {
      const res = await adminApi.getPayoutsExport({
        status: sp.get('status') || undefined,
        dateFrom: sp.get('dateFrom') || undefined,
        dateTo: sp.get('dateTo') || undefined,
      });
      const { csv, filename } = res.data;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Dışa aktarıldı');
    } catch {
      toast.error('Dışa aktarma başarısız');
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
      Dışa Aktar (CSV)
    </Button>
  );
}
