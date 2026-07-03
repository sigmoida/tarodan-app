'use client';

import { useState } from 'react';
import { Modal, ModalFooter, Textarea } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';

export function ForceCancelPaymentModal({
  paymentId,
  onClose,
}: {
  paymentId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');

  const cancel = useAdminMutation(() => adminApi.forceCancelPayment(paymentId, reason), {
    invalidates: ['payments'],
    successMessage: 'Ödeme zorla iptal edildi',
    onSuccess: onClose,
  });

  return (
    <Modal isOpen onClose={onClose} title="Zorla İptal" maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-muted">
          Bu ödemeyi zorla iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
        </p>
        <Textarea
          label="İptal Nedeni *"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="İptal nedeni..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => cancel.mutate()}
          confirmLabel="Zorla İptal Et"
          isLoading={cancel.isPending}
          disabled={!reason.trim()}
        />
      </div>
    </Modal>
  );
}
