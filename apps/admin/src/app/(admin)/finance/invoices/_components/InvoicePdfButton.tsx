'use client';

import { useState } from 'react';
import { Button } from '@tarodan/ui';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';

/** Shared PDF download button for eLogo + seller invoices. */
export function InvoicePdfButton({ id, seller }: { id: string; seller: boolean }) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const res = seller
        ? await adminApi.getSellerInvoicePdf(id)
        : await adminApi.getInvoicePdf(id);
      const url = (res.data as { url?: string })?.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      /* api interceptor toasts */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
      isLoading={busy}
      onClick={onClick}
      className="text-primary-600"
    >
      İndir
    </Button>
  );
}
