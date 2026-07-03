'use client';

import { useState } from 'react';
import { Modal, Button, Checkbox, Textarea } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';

/** Reply to a ticket (optionally as an internal note). Owns its own mutation. */
export function TicketReplyModal({
  ticketId,
  onClose,
}: {
  ticketId: string;
  onClose: () => void;
}) {
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  const reply = useAdminMutation(
    () => adminApi.replyToTicket(ticketId, content, isInternal),
    {
      invalidates: ['tickets'],
      successMessage: 'Yanıt gönderildi',
      onSuccess: onClose,
    },
  );

  return (
    <Modal isOpen onClose={onClose} title="Yanıt Ver" maxWidth="max-w-lg">
      <div className="space-y-4">
        <Textarea
          label="Mesaj"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Yanıtınızı yazın..."
        />
        <Checkbox
          checked={isInternal}
          onChange={(e) => setIsInternal(e.target.checked)}
          label="İç not olarak ekle (kullanıcı göremez)"
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={reply.isPending}>
            İptal
          </Button>
          <Button
            variant="primary"
            onClick={() => reply.mutate()}
            isLoading={reply.isPending}
            disabled={!content.trim()}
          >
            Gönder
          </Button>
        </div>
      </div>
    </Modal>
  );
}
