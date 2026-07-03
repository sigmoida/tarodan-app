'use client';

import { useState } from 'react';
import { Modal, Button, Select } from '@tarodan/ui';
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
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            İptal
          </Button>
          <Button
            variant="primary"
            onClick={() => update.mutate()}
            isLoading={update.isPending}
          >
            Güncelle
          </Button>
        </div>
      </div>
    </Modal>
  );
}
