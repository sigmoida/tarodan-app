'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ChatBubbleLeftRightIcon,
  ArrowUturnLeftIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import {
  Button,
  StatusBadge,
  enumLabel,
  ticketStatusConfig,
  ticketPriorityConfig,
  ticketCategoryConfig,
} from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { DetailPage } from '@/components/detail/DetailPage';
import { SectionCard } from '@/components/detail/SectionCard';
import { PartyCard } from '@/components/detail/PartyCard';
import { Timeline } from '@/components/detail/Timeline';
import { DataList, Field } from '@/components/detail/DataList';
import { TicketReplyModal } from './_modals/TicketReplyModal';
import { TicketStatusModal } from './_modals/TicketStatusModal';

interface SupportTicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  creator: { id: string; displayName: string; email: string };
  assignee?: { id: string; displayName: string };
  messages: Array<{
    id: string;
    sender: { id: string; displayName: string };
    content: string;
    isInternal: boolean;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export default function SupportTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [replyOpen, setReplyOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <DetailPage<SupportTicketDetail>
      resource="tickets"
      id={id}
      fetcher={(tid) => adminApi.getTicket(tid).then((r) => r.data)}
      backHref="/messaging/support"
      emptyTitle="Destek talebi bulunamadı"
      title={(t) => t.subject}
      subtitle={(t) => `#${t.ticketNumber}`}
      badge={(t) => (
        <span className="flex items-center gap-2">
          <StatusBadge status={t.priority} config={ticketPriorityConfig} />
          <StatusBadge status={t.status} config={ticketStatusConfig} />
        </span>
      )}
      actions={() => (
        <>
          <Button
            variant="primary"
            leftIcon={<ArrowUturnLeftIcon className="h-5 w-5" />}
            onClick={() => setReplyOpen(true)}
          >
            Yanıtla
          </Button>
          <Button
            variant="secondary"
            leftIcon={<PencilSquareIcon className="h-5 w-5" />}
            onClick={() => setStatusOpen(true)}
          >
            Durum Güncelle
          </Button>
        </>
      )}
    >
      {(t) => (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <SectionCard title="Mesajlar" icon={ChatBubbleLeftRightIcon}>
                <div className="space-y-4">
                  {t.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-lg p-4 ${
                        message.isInternal
                          ? 'border border-warning-200 bg-warning-50'
                          : 'bg-surface-alt'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-heading">
                            {message.sender.displayName}
                          </span>
                          {message.isInternal && (
                            <span className="rounded bg-warning-200 px-2 py-0.5 text-xs text-warning-800">
                              İç Not
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted">
                          {new Date(message.createdAt).toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-body">{message.content}</p>
                    </div>
                  ))}
                  {t.messages.length === 0 && (
                    <p className="text-sm text-muted">Henüz mesaj yok.</p>
                  )}
                </div>
              </SectionCard>
            </div>

            <div className="space-y-6">
              <SectionCard title="Talep Bilgileri">
                <DataList columns={1}>
                  <Field label="Kategori">
                    {enumLabel(ticketCategoryConfig, t.category, t.category)}
                  </Field>
                  <Field label="Öncelik">
                    <StatusBadge status={t.priority} config={ticketPriorityConfig} />
                  </Field>
                  <Field label="Durum">
                    <StatusBadge status={t.status} config={ticketStatusConfig} />
                  </Field>
                  {t.assignee && <Field label="Atanan">{t.assignee.displayName}</Field>}
                </DataList>
              </SectionCard>

              <PartyCard
                title="Oluşturan"
                name={t.creator.displayName}
                userHref={`/accounts/users/${t.creator.id}`}
                email={t.creator.email}
              />

              <Timeline
                items={[
                  { label: 'Oluşturulma', at: t.createdAt },
                  { label: 'Son Güncelleme', at: t.updatedAt },
                  { label: 'Çözülme', at: t.resolvedAt },
                ]}
              />
            </div>
          </div>

          {replyOpen && (
            <TicketReplyModal ticketId={t.id} onClose={() => setReplyOpen(false)} />
          )}
          {statusOpen && (
            <TicketStatusModal
              ticketId={t.id}
              currentStatus={t.status}
              onClose={() => setStatusOpen(false)}
            />
          )}
        </>
      )}
    </DetailPage>
  );
}
