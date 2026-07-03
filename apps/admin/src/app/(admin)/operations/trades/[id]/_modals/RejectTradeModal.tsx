'use client';

import { useEffect, useState } from 'react';
import { Modal, ModalFooter, Textarea } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';

export function RejectTradeModal({
  open,
  onClose,
  tradeId,
}: {
  open: boolean;
  onClose: () => void;
  tradeId: string;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const reject = useAdminMutation(() => adminApi.rejectTrade(tradeId, reason.trim()), {
    invalidates: ['trades'],
    successMessage: 'Takas reddedildi, ürünler iade ediliyor',
    errorMessage: 'Reddetme başarısız',
    onSuccess: onClose,
  });

  const tooShort = reason.trim().length < 10;

  return (
    <Modal isOpen={open} onClose={() => !reject.isPending && onClose()} title="Takası Reddet">
      <div className="space-y-4">
        <p className="text-sm text-body">
          Takas reddedildiğinde, her iki ürün de sahiplerine iade edilecek ve alıcının ödediği
          nakit geri iade edilecektir.
        </p>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            Red Sebebi <span className="text-danger-600">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={
              reason.length > 0 && tooShort
                ? 'border-danger-400 focus:border-danger-500 focus:ring-danger-200'
                : undefined
            }
            rows={4}
            placeholder="Lütfen en az 10 karakter ile red sebebini belirtin..."
            disabled={reject.isPending}
          />
          <p className="mt-1 text-xs text-muted">{reason.trim().length}/10 karakter minimum</p>
        </div>
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => reject.mutate()}
          confirmLabel="Reddet"
          destructive
          isLoading={reject.isPending}
          disabled={tooShort}
        />
      </div>
    </Modal>
  );
}
