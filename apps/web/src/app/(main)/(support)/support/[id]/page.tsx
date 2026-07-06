'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  ArrowLeftIcon,
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/stores/authStore';
import { supportApi } from '@/lib/api';
import { Button, Textarea } from '@tarodan/ui';

const CATEGORY_LABELS: Record<string, string> = {
  shipping: 'Sipariş / Kargo',
  payment: 'Ödeme',
  account: 'Hesap',
  product: 'İlan / Ürün',
  trade: 'Takas',
  technical: 'Teknik Sorun',
  other: 'Diğer',
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  open: { label: 'Açık', className: 'bg-info-100 text-info-800' },
  in_progress: { label: 'İnceleniyor', className: 'bg-warning-100 text-warning-800' },
  waiting_customer: { label: 'Yanıtınız Bekleniyor', className: 'bg-primary-100 text-primary-800' },
  resolved: { label: 'Çözüldü', className: 'bg-success-100 text-success-800' },
  closed: { label: 'Kapatıldı', className: 'bg-surface-alt text-muted' },
};

interface TicketMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

interface TicketDetail {
  id: string;
  ticketNumber?: string;
  creatorId: string;
  subject: string;
  category: string;
  status: string;
  messages: TicketMessage[];
  createdAt: string;
}

export default function SupportTicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const loadTicket = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supportApi.getTicket(ticketId);
      setTicket(res.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Destek talebi yüklenemedi');
      router.push('/support');
    } finally {
      setLoading(false);
    }
  }, [ticketId, router]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push(`/login?redirect=/support/${ticketId}`);
      return;
    }
    loadTicket();
  }, [authLoading, isAuthenticated, ticketId, router, loadTicket]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reply.trim().length < 1) return;
    setSending(true);
    try {
      await supportApi.addMessage(ticketId, { content: reply.trim() });
      setReply('');
      await loadTicket();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Mesaj gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setSending(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="space-y-3 animate-pulse">
          <div className="h-8 w-1/2 bg-border-subtle rounded" />
          <div className="h-24 bg-border-subtle rounded-lg" />
          <div className="h-24 bg-border-subtle rounded-lg" />
        </div>
      </div>
    );
  }

  if (!ticket) return null;

  const status = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const isClosed = ticket.status === 'closed';

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link
          href="/support"
          className="inline-flex items-center gap-2 text-muted hover:text-heading mb-6 transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Destek Merkezi
        </Link>

        {/* Header */}
        <div className="bg-surface-elevated border border-border rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-heading">{ticket.subject}</h1>
              <p className="text-sm text-muted mt-1">
                {ticket.ticketNumber ? `#${ticket.ticketNumber} · ` : ''}
                {CATEGORY_LABELS[ticket.category] || ticket.category}
                {' · '}
                {new Date(ticket.createdAt).toLocaleDateString('tr-TR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${status.className}`}
            >
              {status.label}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="bg-surface-elevated border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-heading flex items-center gap-2 mb-4">
            <ChatBubbleLeftRightIcon className="w-5 h-5" />
            Mesajlar
          </h2>
          <div className="space-y-4">
            {ticket.messages
              ?.filter((m) => !m.isInternal)
              .map((message) => {
                const mine = message.senderId === ticket.creatorId;
                return (
                  <div
                    key={message.id}
                    className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        mine
                          ? 'bg-primary-500 text-inverted rounded-br-sm'
                          : 'bg-surface border border-border text-body rounded-bl-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <span className={`text-xs font-medium ${mine ? 'text-inverted/90' : 'text-heading'}`}>
                          {mine ? 'Siz' : message.senderName || 'Destek Ekibi'}
                        </span>
                        <span className={`text-[11px] ${mine ? 'text-inverted/70' : 'text-muted'}`}>
                          {new Date(message.createdAt).toLocaleString('tr-TR', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Reply */}
        {isClosed ? (
          <div className="bg-surface-elevated border border-border rounded-xl p-6 text-center text-muted">
            Bu talep kapatılmıştır. Yeni bir sorun için destek talebi oluşturabilirsiniz.
          </div>
        ) : (
          <form onSubmit={handleReply} className="bg-surface-elevated border border-border rounded-xl p-6 space-y-4">
            <Textarea
              id="reply"
              rows={4}
              label="Yanıtınız"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Mesajınızı yazın..."
              maxLength={2000}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                isLoading={sending}
                disabled={sending || reply.trim().length < 1}
                leftIcon={<PaperAirplaneIcon className="w-5 h-5" />}
              >
                Gönder
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
