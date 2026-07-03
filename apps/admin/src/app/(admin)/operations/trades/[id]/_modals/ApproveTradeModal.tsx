'use client';

import { useEffect, useState } from 'react';
import { Modal, Button, Textarea } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';

export function ApproveTradeModal({
  open,
  onClose,
  tradeId,
}: {
  open: boolean;
  onClose: () => void;
  tradeId: string;
}) {
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (open) setNotes('');
  }, [open]);

  const approve = useAdminMutation(
    () => adminApi.approveTrade(tradeId, notes.trim() || undefined),
    {
      invalidates: ['trades'],
      successMessage: 'Takas onaylandı, ürünler alıcılara gönderiliyor',
      errorMessage: 'Onaylama başarısız',
      onSuccess: onClose,
    },
  );

  return (
    <Modal isOpen={open} onClose={() => !approve.isPending && onClose()} title="Takası Onayla">
      <div className="space-y-4">
        <p className="text-sm text-body">
          Takas onaylandığında, her iki ürün de depodan alıcılara gönderilecek ve nakit fark
          alıcıya aktarılacaktır.
        </p>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">Not (Opsiyonel)</label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Onay notu..."
            disabled={approve.isPending}
          />
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={approve.isPending}>
            İptal
          </Button>
          <Button
            variant="success"
            className="flex-1"
            onClick={() => approve.mutate()}
            isLoading={approve.isPending}
          >
            Onayla
          </Button>
        </div>
      </div>
    </Modal>
  );
}
