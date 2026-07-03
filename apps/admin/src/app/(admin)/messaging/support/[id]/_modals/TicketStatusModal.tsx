'use client';

import { useState } from 'react';
import { Modal, ModalFooter, Select } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { TICKET_STATUS_CHOICES } from '../../_lib/types';

/** Change a ticket's status. Owns its own mutation. */
export function TicketStatusModal({
  ticketId,
  currentStatus,
  onClose,
}: {
  ticketId: string;
  currentStatus: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState(currentStatus);

  const update = useAdminMutation(
    () => adminApi.updateTicketStatus(ticketId, status),
    {
      invalidates: ['tickets'],
      successMessage: 'Durum güncellendi',
      onSuccess: onClose,
    },
  );

  return (
    <Modal isOpen onClose={onClose} title="Durum Güncelle" maxWidth="max-w-md">
      <div className="space-y-4">
        <Select
          label="Yeni Durum"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={TICKET_STATUS_CHOICES}
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={() => update.mutate()}
          confirmLabel="Güncelle"
          isLoading={update.isPending}
        />
      </div>
    </Modal>
  );
}
