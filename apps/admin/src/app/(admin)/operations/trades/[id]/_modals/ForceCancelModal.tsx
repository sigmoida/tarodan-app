'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter, Textarea, Checkbox } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';

export function ForceCancelModal({
  open,
  onClose,
  tradeId,
}: {
  open: boolean;
  onClose: () => void;
  tradeId: string;
}) {
  const [reason, setReason] = useState('');
  const [sendBack, setSendBack] = useState(true);
  useEffect(() => {
    if (open) {
      setReason('');
      setSendBack(true);
    }
  }, [open]);

  const forceCancel = useAdminMutation(
    () => adminApi.forceCancelStuckTrade(tradeId, { reason: reason.trim(), sendArrivedItemBack: sendBack }),
    {
      invalidates: ['trades'],
      successMessage: 'Sıkışmış takas çözüldü',
      onSuccess: onClose,
    },
  );

  const submit = () => {
    if (reason.trim().length < 10) {
      toast.error('İptal gerekçesi en az 10 karakter olmalıdır');
      return;
    }
    forceCancel.mutate();
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => !forceCancel.isPending && onClose()}
      title="Sıkışmış Takası Çöz"
    >
      <div className="space-y-4">
        <p className="text-sm text-body">
          Karşı tarafın kargosu Sürat&apos;ta iptal edilecek. Ulaşan ürün (depoda) sahibine geri
          kargolanacak; nakit fark varsa ödeyen kişiye iade edilir.
        </p>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            İptal Gerekçesi (en az 10 karakter)
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Örn. Karşı tarafın kargosu 14 gündür sürat şubesinde sıkıştı, gelen ürünü sahibine iade ediyoruz"
            disabled={forceCancel.isPending}
          />
        </div>
        <Checkbox
          checked={sendBack}
          onChange={(e) => setSendBack(e.target.checked)}
          disabled={forceCancel.isPending}
          label="Ulaşan ürünü sahibine geri yolla (önerilen)"
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          confirmLabel="Sıkışmış Takası Çöz"
          destructive
          isLoading={forceCancel.isPending}
        />
      </div>
    </Modal>
  );
}
