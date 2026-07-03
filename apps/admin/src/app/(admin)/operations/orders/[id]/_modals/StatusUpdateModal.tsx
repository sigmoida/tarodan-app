'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal, ModalFooter, Select } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { isPostShipping } from '../_lib/status';

/**
 * Self-contained order status modal: owns the form + the update mutation
 * (toast + orders invalidation). Post-shipping cancel is blocked.
 */
export function StatusUpdateModal({
  open,
  onClose,
  orderId,
  currentStatus,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  currentStatus: string;
}) {
  const [newStatus, setNewStatus] = useState(currentStatus);
  useEffect(() => {
    if (open) setNewStatus(currentStatus);
  }, [open, currentStatus]);

  const postShipping = isPostShipping(currentStatus);

  const update = useAdminMutation(
    (status: string) => adminApi.updateOrderStatus(orderId, status),
    {
      invalidates: ['orders'],
      successMessage: 'Sipariş durumu güncellendi',
      errorMessage: 'Durum güncelleme başarısız',
      onSuccess: onClose,
    },
  );

  const submit = () => {
    if (newStatus === 'cancelled' && postShipping) {
      toast.error('Kargo sonrası iptal yapılamaz — iade akışını kullanın.');
      return;
    }
    update.mutate(newStatus);
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Durum Güncelle">
      <div className="mb-4">
        <label className="mb-2 block text-sm font-medium text-body">Yeni Durum</label>
        <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
          <option value="pending_payment">Ödeme Bekliyor</option>
          <option value="paid">Ödendi</option>
          <option value="preparing">Hazırlanıyor</option>
          <option value="shipped">Kargoda</option>
          <option value="delivered">Teslim Edildi</option>
          <option value="completed">Tamamlandı</option>
          <option value="cancelled" disabled={postShipping}>
            İptal{postShipping ? ' (kargo sonrası kapalı)' : ''}
          </option>
          <option value="refunded">İade Edildi</option>
        </Select>
        {postShipping && (
          <p className="mt-2 text-xs text-muted">
            Kargo sonrası iptal yapılamaz. Bu aşamada iade için İade Talepleri akışını
            kullanın.
          </p>
        )}
      </div>
      <ModalFooter
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel="Güncelle"
        isLoading={update.isPending}
      />
    </Modal>
  );
}
