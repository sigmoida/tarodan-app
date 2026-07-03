'use client';

import { useState, type ComponentType } from 'react';
import clsx from 'clsx';
import {
  Button,
  Input,
  Select,
  Textarea,
  Modal,
  ModalFooter,
} from '@tarodan/ui';
import {
  BellIcon,
  PaperAirplaneIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { adminApi } from '@/lib/api';
import { useAdminMutation } from '@/lib/query/useAdminMutation';
import { SectionCard } from '@/components/detail/SectionCard';
import {
  type SendForm,
  emptySendForm,
  channelMeta,
  targetMeta,
  sendFormToPayload,
} from '../_lib/types';

/** Card-tile selectable button (channel / target). */
function Tile({
  active,
  icon: Icon,
  label,
  desc,
  onClick,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={clsx(
        'relative h-auto flex-col items-center gap-2 rounded-xl border-2 p-4 text-center',
        active
          ? 'border-primary-500 bg-primary-50 text-primary-700'
          : 'border-border bg-surface text-muted hover:border-border-strong hover:text-body',
      )}
    >
      {active && (
        <CheckCircleIcon className="absolute right-2 top-2 h-4 w-4 text-primary-500" />
      )}
      <Icon className={clsx('h-6 w-6', active ? 'text-primary-500' : 'text-subtle')} />
      <span className="text-sm font-medium">{label}</span>
      <span className={clsx('text-xs leading-tight', active ? 'text-primary-600' : 'text-muted')}>
        {desc}
      </span>
    </Button>
  );
}

export function SendNotificationForm({ onScheduled }: { onScheduled: () => void }) {
  const [form, setForm] = useState<SendForm>(emptySendForm);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');

  const send = useAdminMutation(() => adminApi.sendNotification(sendFormToPayload(form)), {
    successMessage: 'Bildirim gönderildi',
    onSuccess: () => setForm(emptySendForm),
  });
  const schedule = useAdminMutation(
    () =>
      adminApi.scheduleNotification({
        ...sendFormToPayload(form),
        scheduledFor: new Date(scheduleDate).toISOString(),
      }),
    {
      invalidates: ['scheduled-notifications'],
      successMessage: 'Bildirim zamanlandı',
      onSuccess: () => {
        setScheduleOpen(false);
        setScheduleDate('');
        onScheduled();
      },
    },
  );

  const toggleChannel = (c: string) =>
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(c)
        ? f.channels.filter((x) => x !== c)
        : [...f.channels, c],
    }));

  const titleOk = form.title.length > 0 && form.title.length <= 65;
  const bodyOk = form.body.length > 0 && form.body.length <= 240;
  const canSend = titleOk && bodyOk && form.channels.length > 0;

  const onSend = () => {
    if (!canSend) {
      toast.error('Başlık, içerik ve en az bir kanal zorunludur');
      return;
    }
    if (form.targetType === 'user_ids' && !form.userIds.trim()) {
      toast.error('En az bir kullanıcı ID girin');
      return;
    }
    send.mutate();
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-5">
      {/* Sol: Form */}
      <div className="space-y-5 xl:col-span-3">
        <SectionCard title="Mesaj" bodyClassName="space-y-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-body">
                Başlık <span className="text-danger-500">*</span>
              </span>
              <span
                className={clsx(
                  'text-xs',
                  form.title.length > 65 ? 'font-medium text-danger-500' : 'text-muted',
                )}
              >
                {form.title.length}/65
              </span>
            </div>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Bildirim başlığı"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-body">
                İçerik <span className="text-danger-500">*</span>
              </span>
              <span
                className={clsx(
                  'text-xs',
                  form.body.length > 240 ? 'font-medium text-danger-500' : 'text-muted',
                )}
              >
                {form.body.length}/240
              </span>
            </div>
            <Textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              rows={4}
              placeholder="Kullanıcılara gösterilecek bildirim metni"
            />
          </div>
        </SectionCard>

        <SectionCard title="Gönderim Kanalı" bodyClassName="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {channelMeta.map((c) => (
              <Tile
                key={c.key}
                active={form.channels.includes(c.key)}
                icon={c.icon}
                label={c.label}
                desc={c.desc}
                onClick={() => toggleChannel(c.key)}
              />
            ))}
          </div>
          {form.channels.length === 0 && (
            <p className="text-xs text-danger-500">En az bir kanal seçmelisiniz.</p>
          )}
        </SectionCard>

        <SectionCard title="Hedef Kitle" bodyClassName="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {targetMeta.map((t) => (
              <Tile
                key={t.key}
                active={form.targetType === t.key}
                icon={t.icon}
                label={t.label}
                desc={t.desc}
                onClick={() => setForm({ ...form, targetType: t.key as SendForm['targetType'] })}
              />
            ))}
          </div>

          {form.targetType === 'user_ids' && (
            <Input
              label="Kullanıcı ID'leri (virgülle ayırın)"
              value={form.userIds}
              onChange={(e) => setForm({ ...form, userIds: e.target.value })}
              placeholder="uuid1, uuid2, uuid3"
            />
          )}

          {form.targetType === 'segment' && (
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-surface-alt p-4">
              <Select
                label="Satıcı Durumu"
                value={form.isSeller === undefined ? '' : form.isSeller ? 'true' : 'false'}
                onChange={(e) =>
                  setForm({
                    ...form,
                    isSeller: e.target.value === '' ? undefined : e.target.value === 'true',
                  })
                }
                options={[
                  { value: '', label: 'Hepsi' },
                  { value: 'true', label: 'Sadece Satıcılar' },
                  { value: 'false', label: 'Sadece Alıcılar' },
                ]}
              />
              <Select
                label="Üyelik Tipi"
                value={form.membershipTier}
                onChange={(e) => setForm({ ...form, membershipTier: e.target.value })}
                options={[
                  { value: '', label: 'Hepsi' },
                  { value: 'free', label: 'Free' },
                  { value: 'premium', label: 'Premium' },
                  { value: 'business', label: 'Business' },
                ]}
              />
            </div>
          )}
        </SectionCard>

        <div className="flex gap-3">
          <Button
            leftIcon={<PaperAirplaneIcon className="h-4 w-4" />}
            onClick={onSend}
            isLoading={send.isPending}
            disabled={!canSend}
            className="flex-1 justify-center"
          >
            Şimdi Gönder
          </Button>
          <Button
            variant="secondary"
            leftIcon={<ClockIcon className="h-4 w-4" />}
            onClick={() => setScheduleOpen(true)}
            disabled={!canSend}
            className="flex-1 justify-center"
          >
            Zamanla
          </Button>
        </div>
      </div>

      {/* Sağ: Önizleme */}
      <div className="xl:col-span-2">
        <SectionCard title="Canlı Önizleme" className="sticky top-6" bodyClassName="space-y-5">
          {form.channels.includes('push') && (
            <div>
              <p className="mb-2 flex items-center gap-1 text-xs text-muted">
                <DevicePhoneMobileIcon className="h-3.5 w-3.5" /> Push bildirimi
              </p>
              <div className="rounded-2xl bg-heading p-4 shadow-lg">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500">
                    <BellIcon className="h-5 w-5 text-inverted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-inverted">
                      {form.title || (
                        <span className="font-normal italic text-inverted/50">Başlık girin…</span>
                      )}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-inverted/70">
                      {form.body || <span className="italic">İçerik girin…</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-inverted/50">şimdi</span>
                </div>
              </div>
            </div>
          )}

          {form.channels.includes('email') && (
            <div>
              <p className="mb-2 flex items-center gap-1 text-xs text-muted">
                <EnvelopeIcon className="h-3.5 w-3.5" /> E-posta
              </p>
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="border-b border-border bg-surface-alt px-4 py-2.5">
                  <p className="text-xs text-muted">Konu:</p>
                  <p className="truncate text-sm font-medium text-heading">
                    {form.title || <span className="italic text-subtle">Başlık girin…</span>}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="line-clamp-3 text-sm leading-relaxed text-body">
                    {form.body || <span className="italic text-subtle">İçerik girin…</span>}
                  </p>
                </div>
              </div>
            </div>
          )}

          {form.channels.includes('sms') && (
            <div>
              <p className="mb-2 flex items-center gap-1 text-xs text-muted">
                <ChatBubbleLeftRightIcon className="h-3.5 w-3.5" /> SMS
              </p>
              <div className="flex">
                <div className="max-w-xs rounded-2xl rounded-tl-sm bg-success-100 px-4 py-2.5 text-sm leading-relaxed text-success-900 shadow-sm">
                  {form.title && form.body ? (
                    `${form.title}: ${form.body}`
                  ) : (
                    <span className="italic text-muted">Mesaj önizlemesi…</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {form.channels.length === 0 && (
            <div className="py-8 text-center text-muted">
              <BellIcon className="mx-auto mb-2 h-10 w-10 text-subtle" />
              <p className="text-sm">Önizleme için kanal seçin</p>
            </div>
          )}

          <div className="space-y-2 border-t border-border pt-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Hedef</span>
              <span className="font-medium text-body">
                {targetMeta.find((t) => t.key === form.targetType)?.label}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Kanallar</span>
              <span className="font-medium text-body">
                {form.channels.length === 0
                  ? '—'
                  : form.channels
                      .map((c) => channelMeta.find((m) => m.key === c)?.label)
                      .join(', ')}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">Durum</span>
              <span className={clsx('font-medium', canSend ? 'text-success-600' : 'text-warning-600')}>
                {canSend ? 'Gönderime hazır' : 'Eksik alanlar var'}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      {scheduleOpen && (
        <Modal
          isOpen
          onClose={() => setScheduleOpen(false)}
          title="Bildirimi Zamanla"
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <Input
              type="datetime-local"
              label="Gönderim Tarihi ve Saati"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
            <ModalFooter
              onCancel={() => setScheduleOpen(false)}
              onConfirm={() => schedule.mutate()}
              confirmLabel="Zamanla"
              isLoading={schedule.isPending}
              disabled={!scheduleDate}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
