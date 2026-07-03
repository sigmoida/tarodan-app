'use client';

import { useState } from 'react';
import { Modal, ModalFooter, Input, Textarea } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { fmtTry } from '@/lib/format';

export function RefundPaymentModal({
  paymentId,
  amount,
  onClose,
}: {
  paymentId: string;
  amount: number;
  onClose: () => void;
}) {
  const [refundAmount, setRefundAmount] = useState('');
  const [reason, setReason] = useState('');

  const refund = useAdminMutation(
    () =>
      adminApi.manualRefund(paymentId, {
        amount: refundAmount ? parseFloat(refundAmount) : undefined,
        reason: reason || undefined,
      }),
    { invalidates: ['payments'], successMessage: 'İade işlemi başlatıldı', onSuccess: onClose },
  );

  return (
    <Modal isOpen onClose={onClose} title="Manuel İade" maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-muted">Toplam ödeme tutarı: {fmtTry(amount)}</p>
        <Input
          type="number"
          min="0.01"
          max={amount}
          step="0.01"
          label="İade Tutarı (boş bırakırsanız tam iade)"
          value={refundAmount}
          onChange={(e) => setRefundAmount(e.target.value)}
          placeholder="İade tutarı (opsiyonel)"
        />
        <Textarea
          label="İade Nedeni (opsiyonel)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="İade nedeni..."
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => refund.mutate()}
          confirmLabel="İade Et"
          destructive
          isLoading={refund.isPending}
        />
      </div>
    </Modal>
  );
}
