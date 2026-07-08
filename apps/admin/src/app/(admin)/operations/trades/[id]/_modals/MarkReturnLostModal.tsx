'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter, Textarea } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/hooks/useAdminMutation';

/** Open when `shipmentId` is set; marks that return shipment lost. */
export function MarkReturnLostModal({
  shipmentId,
  onClose,
  tradeId,
}: {
  shipmentId: string | null;
  onClose: () => void;
  tradeId: string;
}) {
  const open = !!shipmentId;
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  const markLost = useAdminMutation(
    () => adminApi.markTradeReturnLost(tradeId, { shipmentId: shipmentId as string, reason: reason.trim() }),
    {
      invalidates: ['trades'],
      successMessage: 'İade gönderisi kayıp olarak işaretlendi',
      onSuccess: onClose,
    },
  );

  const submit = () => {
    if (reason.trim().length < 10) {
      toast.error('Kayıp gerekçesi en az 10 karakter olmalıdır');
      return;
    }
    markLost.mutate();
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => !markLost.isPending && onClose()}
      title="İade Gönderisini Kayıp İşaretle"
    >
      <div className="space-y-4">
        <p className="text-sm text-body">
          Bu gönderi kayıp olarak işaretlenecek. Eğer her iki iade kargosu da çözümlendi sayılırsa
          (teslim veya kayıp) takas iptal edilir ve etkilenen kullanıcı için tazminat bekliyor
          olarak işaretlenir.
        </p>
        <div>
          <label className="mb-2 block text-sm font-medium text-body">
            Kayıp Gerekçesi (en az 10 karakter)
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Örn. Kargo şubeden çıktıktan sonra teslim edilemedi, sürat takibinde kayıp"
            disabled={markLost.isPending}
          />
        </div>
        <ModalFooter
          onCancel={onClose}
          onConfirm={submit}
          confirmLabel="Kayıp İşaretle"
          destructive
          isLoading={markLost.isPending}
        />
      </div>
    </Modal>
  );
}
