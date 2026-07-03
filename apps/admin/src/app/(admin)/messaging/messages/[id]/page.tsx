'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { Button, Spinner, StatusBadge } from '@tarodan/ui';
import type { StatusConfig } from '@tarodan/ui';
import toast from 'react-hot-toast';
import { usePrompt } from '@/components/PromptProvider';

// ─── Tipler ────────────────────────────────────────────────────────────────

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

// ─── Sabitler ──────────────────────────────────────────────────────────────

const messageStatusConfig: Record<string, StatusConfig> = {
  sent: { label: 'Gönderildi', variant: 'default' },
  pending: { label: 'Onay Bekliyor', variant: 'warning' },
  pending_approval: { label: 'Onay Bekliyor', variant: 'warning' },
  approved: { label: 'Onaylandı', variant: 'success' },
  rejected: { label: 'Reddedildi', variant: 'danger' },
};

// ─── Yardımcılar ────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted w-36 shrink-0">{label}</span>
      <span className="text-sm text-heading flex-1">{value ?? '-'}</span>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-primary-500" />
        <h2 className="font-semibold text-heading">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function MessageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const prompt = usePrompt();

  const load = async () => {
    try {
      const res = await adminApi.getMessage(id);
      setMessage(res.data);
    } catch {
      toast.error('Mesaj detayı yüklenemedi');
      router.push('/messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleApprove = async () => {
    if (!message) return;
    setActionLoading(true);
    try {
      await adminApi.approveMessage(message.id);
      toast.success('Mesaj onaylandı');
      load();
    } catch {
      toast.error('İşlem başarısız');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!message) return;
    const reason = await prompt({
      title: 'Mesajı Reddet',
      label: 'Red nedeni',
      placeholder: 'Mesajın neden reddedildiğini yaz...',
      confirmLabel: 'Reddet',
      destructive: true,
      requiredMessage: 'Red nedeni gereklidir',
    });
    if (reason === null) return;
    setActionLoading(true);
    try {
      await adminApi.rejectMessage(message.id, reason);
      toast.success('Mesaj reddedildi');
      load();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!message) return null;

  const isPending =
    message.status === 'pending' || message.status === 'pending_approval';

  const threadMessages = message.thread?.messages ?? [];

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() =>
              window.history.length > 1 ? router.back() : router.push('/messages')
            }
            aria-label="Geri"
            className="p-2 hover:bg-border-subtle rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-muted" />
          </button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-heading">Mesaj Detayı</h1>
            <p className="text-sm text-muted">
              {new Date(message.createdAt).toLocaleString('tr-TR')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={message.status} config={messageStatusConfig} />
            {isPending && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleApprove}
                  disabled={actionLoading}
                >
                  <CheckCircleIcon className="w-4 h-4 mr-1 text-success-500" />
                  Onayla
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleReject}
                  disabled={actionLoading}
                >
                  <XCircleIcon className="w-4 h-4 mr-1 text-danger-500" />
                  Reddet
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Mesaj içeriği */}
        <Card title="Mesaj" icon={ChatBubbleLeftRightIcon}>
          {message.originalContent && message.originalContent !== message.content && (
            <div className="mb-3">
              <p className="text-xs text-muted mb-1">Orijinal içerik</p>
              <p className="text-sm text-heading bg-surface-alt rounded p-3 border border-border">
                {message.originalContent}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted mb-1">İçerik</p>
            <p className="text-sm text-heading bg-surface-alt rounded p-3 border border-border">
              {message.content}
            </p>
          </div>

          {message.flaggedReason && (
            <div className="mt-3 flex items-start gap-2 bg-warning-50 border border-warning-200 rounded p-3">
              <ExclamationTriangleIcon className="w-4 h-4 text-warning-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-warning-700">İşaretlenme Nedeni</p>
                <p className="text-sm text-warning-800">{message.flaggedReason}</p>
              </div>
            </div>
          )}

          <div className="mt-4">
            <InfoRow label="Konu ID" value={<span className="font-mono text-xs">{message.threadId}</span>} />
          </div>
        </Card>

        {/* Taraflar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Gönderen" icon={ChatBubbleLeftRightIcon}>
            <InfoRow label="Ad" value={message.sender.displayName} />
            <InfoRow label="E-posta" value={message.sender.email} />
            {message.sender.phone && (
              <InfoRow label="Telefon" value={message.sender.phone} />
            )}
            <InfoRow label="ID" value={<span className="font-mono text-xs">{message.sender.id}</span>} />
          </Card>

          <Card title="Alıcı" icon={ChatBubbleLeftRightIcon}>
            <InfoRow label="Ad" value={message.receiver.displayName} />
            <InfoRow label="E-posta" value={message.receiver.email} />
            {message.receiver.phone && (
              <InfoRow label="Telefon" value={message.receiver.phone} />
            )}
            <InfoRow label="ID" value={<span className="font-mono text-xs">{message.receiver.id}</span>} />
          </Card>
        </div>

        {/* Konuşma geçmişi */}
        {threadMessages.length > 0 && (
          <Card
            title={`Konuşma Geçmişi (${threadMessages.length} mesaj)`}
            icon={ChatBubbleLeftRightIcon}
          >
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {threadMessages.map((msg) => {
                const isSender = msg.senderId === message.senderId;
                const isCurrentMessage = msg.id === message.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs md:max-w-md rounded-xl px-3 py-2 text-sm ${
                        isCurrentMessage ? 'ring-2 ring-primary-400' : ''
                      } ${
                        isSender
                          ? 'bg-primary-500 text-white'
                          : 'bg-surface-alt text-heading border border-border'
                      }`}
                    >
                      <p>{msg.content}</p>
                      <p className={`text-xs mt-1 ${isSender ? 'text-primary-100' : 'text-muted'}`}>
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
          </Card>
        )}

      </main>
    </div>
  );
}
