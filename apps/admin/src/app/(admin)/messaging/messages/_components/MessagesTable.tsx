'use client';

import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Badge, StatusBadge } from '@tarodan/ui';
import {
  CheckIcon,
  XMarkIcon,
  NoSymbolIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { col } from '@/components/table';
import { ActionButtons, ActionIconButton } from '@/components/AdminList';
import { ResourceList } from '@/components/list';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { usePrompt } from '@/provider/PromptProvider';
import { type Message, messageStatusConfig } from '../_lib/types';

/**
 * The messages table — moderation row actions (approve / reject / revert / ban
 * sender) live here as mutations; rows come from the ResourceList context
 * (already mapped to `Message` by the page fetcher).
 */
export function MessagesTable() {
  const router = useRouter();
  const prompt = usePrompt();

  const approve = useAdminMutation((id: string) => adminApi.approveMessage(id), {
    invalidates: ['messages'],
    successMessage: 'Mesaj onaylandı',
  });
  const reject = useAdminMutation((id: string) => adminApi.rejectMessage(id), {
    invalidates: ['messages'],
    successMessage: 'Mesaj reddedildi',
  });
  const revert = useAdminMutation((id: string) => adminApi.revertMessage(id), {
    invalidates: ['messages'],
    successMessage: 'Mesaj bekleyene alındı',
  });
  const ban = useAdminMutation(
    (v: { id: string; reason: string }) => adminApi.banUser(v.id, v.reason),
    { invalidates: ['messages'], successMessage: 'Gönderen kullanıcı engellendi' },
  );

  const onBan = async (m: Message) => {
    if (!m.senderId) {
      toast.error('Gönderen bilgisi bulunamadı');
      return;
    }
    const reason = await prompt({
      title: 'Göndereni Yasakla',
      label: 'Yasaklama sebebi (mesaj ihlali)',
      defaultValue: 'Mesaj kuralları ihlali',
      confirmLabel: 'Yasakla',
      destructive: true,
      required: false,
    });
    if (reason === null) return;
    ban.mutate({ id: m.senderId, reason: reason.trim() || 'Mesaj kuralları ihlali' });
  };

  const columns = [
    col.user<Message>('Gönderen', (m) => ({
      name: m.sender.displayName,
      secondary: m.sender.email,
    })),
    col.user<Message>('Alıcı', (m) => ({
      name: m.receiver.displayName,
      secondary: m.receiver.email,
    })),
    col.text<Message>('Mesaj', (m) => m.originalContent || m.content, {
      grow: 3,
      minWidth: 220,
    }),
    col.badge<Message>('Uyarı', (m) =>
      m.flaggedReason ? (
        <Badge variant="warning">{m.flaggedReason}</Badge>
      ) : (
        <span className="text-muted">—</span>
      ),
    ),
    col.badge<Message>('Durum', (m) => (
      <StatusBadge status={m.status} config={messageStatusConfig} />
    )),
    col.date<Message>('Tarih', (m) => m.createdAt),
    col.actions<Message>(
      (m) => (
        <ActionButtons>
          {(m.status === 'pending' || m.status === 'rejected') && (
            <ActionIconButton
              icon={CheckIcon}
              onClick={() => approve.mutate(m.id)}
              title="Onayla"
              variant="success"
            />
          )}
          {m.status === 'rejected' ? (
            <ActionIconButton
              icon={ArrowUturnLeftIcon}
              onClick={() => revert.mutate(m.id)}
              title="Geri Al (Bekleyene çevir)"
              variant="primary"
            />
          ) : (
            <ActionIconButton
              icon={XMarkIcon}
              onClick={() => reject.mutate(m.id)}
              title="Reddet"
              variant="danger"
            />
          )}
          {m.senderId && (
            <ActionIconButton
              icon={NoSymbolIcon}
              onClick={() => onBan(m)}
              title="Göndereni yasakla"
              variant="primary"
            />
          )}
        </ActionButtons>
      ),
      { header: 'İşlemler' },
    ),
  ];

  return (
    <ResourceList.Table
      columns={columns}
      onRowClick={(m) => router.push(`/messaging/messages/${m.id}`)}
      emptyText="Mesaj bulunamadı"
    />
  );
}
