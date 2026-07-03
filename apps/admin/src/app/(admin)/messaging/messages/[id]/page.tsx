'use client';

import { useParams } from 'next/navigation';
import {
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { Button, StatusBadge } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { DetailPage } from '@/components/detail/DetailPage';
import { SectionCard } from '@/components/detail/SectionCard';
import { PartyCard } from '@/components/detail/PartyCard';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { usePrompt } from '@/provider/PromptProvider';
import { messageStatusConfig } from '../_lib/types';

interface MessageDetail {
  id: string;
  content: string;
  originalContent: string;
  status: string;
  flaggedReason: string | null;
  createdAt: string;
  updatedAt: string;
  senderId: string;
  receiverId: string;
  threadId: string;
  sender: { id: string; displayName: string; email: string; phone?: string };
  receiver: { id: string; displayName: string; email: string; phone?: string };
  thread: {
    id: string;
    messages: Array<{
      id: string;
      content: string;
      originalContent?: string;
      status: string;
      createdAt: string;
      senderId: string;
    }>;
  } | null;
}

const isPending = (status: string) =>
  status === 'pending' || status === 'pending_approval';

export default function MessageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const prompt = usePrompt();

  const approve = useAdminMutation(() => adminApi.approveMessage(id), {
    invalidates: ['messages'],
    successMessage: 'Mesaj onaylandı',
  });
  const reject = useAdminMutation(
    (reason: string) => adminApi.rejectMessage(id, reason),
    { invalidates: ['messages'], successMessage: 'Mesaj reddedildi' },
  );

  const onReject = async () => {
    const reason = await prompt({
      title: 'Mesajı Reddet',
      label: 'Red nedeni',
      placeholder: 'Mesajın neden reddedildiğini yaz...',
      confirmLabel: 'Reddet',
      destructive: true,
      requiredMessage: 'Red nedeni gereklidir',
    });
    if (reason === null) return;
    reject.mutate(reason);
  };

  return (
    <DetailPage<MessageDetail>
      resource="messages"
      id={id}
      fetcher={(mid) => adminApi.getMessage(mid).then((r) => r.data)}
      backHref="/messaging/messages"
      emptyTitle="Mesaj bulunamadı"
      title={() => 'Mesaj Detayı'}
      subtitle={(m) => new Date(m.createdAt).toLocaleString('tr-TR')}
      badge={(m) => <StatusBadge status={m.status} config={messageStatusConfig} />}
      actions={(m) =>
        isPending(m.status) && (
          <>
            <Button
              variant="secondary"
              leftIcon={<CheckCircleIcon className="h-5 w-5 text-success-500" />}
              onClick={() => approve.mutate()}
              isLoading={approve.isPending}
            >
              Onayla
            </Button>
            <Button
              variant="secondary"
              leftIcon={<XCircleIcon className="h-5 w-5 text-danger-500" />}
              onClick={onReject}
              isLoading={reject.isPending}
            >
              Reddet
            </Button>
          </>
        )
      }
    >
      {(m) => {
        const threadMessages = m.thread?.messages ?? [];
        return (
          <>
            <SectionCard title="Mesaj" icon={ChatBubbleLeftRightIcon}>
              {m.originalContent && m.originalContent !== m.content && (
                <div className="mb-3">
                  <p className="mb-1 text-xs text-muted">Orijinal içerik</p>
                  <p className="rounded border border-border bg-surface-alt p-3 text-sm text-heading">
                    {m.originalContent}
                  </p>
                </div>
              )}
              <div>
                <p className="mb-1 text-xs text-muted">İçerik</p>
                <p className="rounded border border-border bg-surface-alt p-3 text-sm text-heading">
                  {m.content}
                </p>
              </div>

              {m.flaggedReason && (
                <div className="mt-3 flex items-start gap-2 rounded border border-warning-200 bg-warning-50 p-3">
                  <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-warning-500" />
                  <div>
                    <p className="text-xs font-medium text-warning-700">
                      İşaretlenme Nedeni
                    </p>
                    <p className="text-sm text-warning-800">{m.flaggedReason}</p>
                  </div>
                </div>
              )}

              <p className="mt-4 text-xs text-muted">
                Konu ID: <span className="font-mono">{m.threadId}</span>
              </p>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <PartyCard
                title="Gönderen"
                icon={UserIcon}
                name={m.sender.displayName}
                userHref={`/accounts/users/${m.sender.id}`}
                email={m.sender.email}
                phone={m.sender.phone}
              />
              <PartyCard
                title="Alıcı"
                icon={UserIcon}
                name={m.receiver.displayName}
                userHref={`/accounts/users/${m.receiver.id}`}
                email={m.receiver.email}
                phone={m.receiver.phone}
              />
            </div>

            {threadMessages.length > 0 && (
              <SectionCard
                title={`Konuşma Geçmişi (${threadMessages.length} mesaj)`}
                icon={ChatBubbleLeftRightIcon}
              >
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {threadMessages.map((msg) => {
                    const isSender = msg.senderId === m.senderId;
                    const isCurrent = msg.id === m.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs rounded-xl px-3 py-2 text-sm md:max-w-md ${
                            isCurrent ? 'ring-2 ring-primary-400' : ''
                          } ${
                            isSender
                              ? 'bg-primary-500 text-inverted'
                              : 'border border-border bg-surface-alt text-heading'
                          }`}
                        >
                          <p>{msg.content}</p>
                          <p
                            className={`mt-1 text-xs ${
                              isSender ? 'text-inverted/80' : 'text-muted'
                            }`}
                          >
                            {new Date(msg.createdAt).toLocaleString('tr-TR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}
          </>
        );
      }}
    </DetailPage>
  );
}
