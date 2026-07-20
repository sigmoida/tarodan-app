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

  const approve = useAdminMutation((message: Message) => adminApi.approveMessage(message.id), {
    invalidates: ['messages'],
    successMessage: 'Mesaj onaylandı',
  });
  const reject = useAdminMutation((message: Message) => adminApi.rejectMessage(message.id), {
    invalidates: ['messages'],
    successMessage: 'Mesaj reddedildi',
  });
  const revert = useAdminMutation((message: Message) => adminApi.revertMessage(message.id), {
    invalidates: ['messages'],
    successMessage: 'Mesaj bekleyene alındı',
  });
  const ban = useAdminMutation(
    (v: { messageId: string; userId: string; reason: string }) =>
      adminApi.banUser(v.userId, v.reason),
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
    ban.mutate({
      messageId: m.id,
      userId: m.senderId,
      reason: reason.trim() || 'Mesaj kuralları ihlali',
    });
  };

  const columns = messageColumns(
    messageRowMenu({
      onView: (m) => router.push(`/messaging/messages/${m.id}`),
      onApprove: (m) => approve.mutate(m),
      onReject: (m) => reject.mutate(m),
      onRevert: (m) => revert.mutate(m),
      onBan,
      busyId: approve.isPending
        ? approve.variables?.id
        : reject.isPending
          ? reject.variables?.id
          : revert.isPending
            ? revert.variables?.id
            : ban.isPending
              ? ban.variables?.messageId
              : undefined,
    }),
  );

  return <ResourceList.Table columns={columns} emptyText="Mesaj bulunamadı" />;
}
