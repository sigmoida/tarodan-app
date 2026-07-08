'use client';

import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { ResourceList } from '@/components/list';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { usePrompt } from '@/provider/PromptProvider';
import { messageColumns } from '../_lib/columns';
import { messageRowMenu } from '../_lib/rowActions';
import { type Message } from '../_lib/types';

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

  const columns = messageColumns(
    messageRowMenu({
      onView: (m) => router.push(`/messaging/messages/${m.id}`),
      onApprove: (m) => approve.mutate(m.id),
      onReject: (m) => reject.mutate(m.id),
      onRevert: (m) => revert.mutate(m.id),
      onBan,
    }),
  );

  return <ResourceList.Table columns={columns} emptyText="Mesaj bulunamadı" />;
}
