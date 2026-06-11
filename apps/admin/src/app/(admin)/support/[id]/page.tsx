'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  UserIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Select, Spinner, Textarea, enumLabel, ticketCategoryConfig } from '@tarodan/ui';

interface SupportTicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  creator: {
    id: string;
    displayName: string;
    email: string;
  };
  assignee?: {
    id: string;
    displayName: string;
  };
  messages: Array<{
    id: string;
    sender: {
      id: string;
      displayName: string;
    };
    content: string;
    isInternal: boolean;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: 'Açık', color: 'text-info-600', bg: 'bg-info-100' },
  in_progress: { label: 'İşlemde', color: 'text-warning-600', bg: 'bg-warning-100' },
  waiting_customer: { label: 'Müşteri Bekleniyor', color: 'text-primary-600', bg: 'bg-primary-100' },
  resolved: { label: 'Çözüldü', color: 'text-success-600', bg: 'bg-success-100' },
  closed: { label: 'Kapatıldı', color: 'text-muted', bg: 'bg-surface-alt' },
};

const priorityConfig: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Düşük', color: 'text-muted', bg: 'bg-surface-alt' },
  medium: { label: 'Orta', color: 'text-warning-600', bg: 'bg-warning-100' },
  high: { label: 'Yüksek', color: 'text-primary-600', bg: 'bg-primary-100' },
  urgent: { label: 'Acil', color: 'text-danger-600', bg: 'bg-danger-100' },
};

export default function SupportTicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.id as string;

  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (ticketId) {
      loadTicket();
    }
  }, [ticketId]);

  const loadTicket = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getTicket(ticketId);
      setTicket(response.data);
      setNewStatus(response.data.status);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Ticket load error:', error);
      toast.error(error.response?.data?.message || 'Destek talebi yüklenemedi');
      router.push('/support');
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async () => {
    if (!replyMessage.trim()) {
      toast.error('Mesaj gereklidir');
      return;
    }

    setProcessing(true);
    try {
      await adminApi.replyToTicket(ticketId, replyMessage);
      toast.success('Yanıt gönderildi');
      setShowReplyModal(false);
      setReplyMessage('');
      loadTicket();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Yanıt gönderme başarısız');
    } finally {
      setProcessing(false);
    }
  };

  const handleStatusUpdate = async () => {
    setProcessing(true);
    try {
      await adminApi.updateTicket(ticketId, { status: newStatus });
      toast.success('Durum güncellendi');
      setShowStatusModal(false);
      loadTicket();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Durum güncelleme başarısız');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Spinner size="xl" color="border-primary-600 border-t-transparent" className="mx-auto" />
          <p className="mt-4 text-muted">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Destek talebi bulunamadı</p>
      </div>
    );
  }

  const statusInfo = statusConfig[ticket.status] || statusConfig.open;
  const priorityInfo = priorityConfig[ticket.priority] || priorityConfig.medium;

  return (
      <div className="min-h-screen bg-surface">
        <main className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/support"
              className="p-2 hover:bg-border-subtle rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6 text-muted" />
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-heading">{ticket.subject}</h1>
              <p className="text-sm text-muted">#{ticket.ticketNumber}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-4 py-2 rounded-full font-medium ${priorityInfo.color} ${priorityInfo.bg}`}>
                {priorityInfo.label}
              </span>
              <span className={`px-4 py-2 rounded-full font-medium ${statusInfo.color} ${statusInfo.bg}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Messages */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
                    <ChatBubbleLeftRightIcon className="w-5 h-5" />
                    Mesajlar
                  </h2>
                  <Button variant="secondary" onClick={() => setShowReplyModal(true)}
                    className="px-4 py-2 bg-primary-600 text-heading rounded-lg hover:bg-primary-700 transition-colors">
                    Yanıtla
                  </Button>
                </div>
                <div className="space-y-4">
                  {ticket.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`p-4 rounded-lg ${
                        message.isInternal
                          ? 'bg-warning-50 border border-warning-200'
                          : 'bg-surface'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{message.sender.displayName}</span>
                          {message.isInternal && (
                            <span className="text-xs px-2 py-1 bg-warning-200 text-warning-800 rounded">
                              İç Not
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted">
                          {new Date(message.createdAt).toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <p className="text-body whitespace-pre-wrap">{message.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Ticket Info */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-heading mb-4">Talep Bilgileri</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-muted text-sm">Kategori:</span>
                    <p className="font-medium">{enumLabel(ticketCategoryConfig, ticket.category)}</p>
                  </div>
                  <div>
                    <span className="text-muted text-sm">Öncelik:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${priorityInfo.color} ${priorityInfo.bg}`}>
                      {priorityInfo.label}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted text-sm">Durum:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${statusInfo.color} ${statusInfo.bg}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  {ticket.assignee && (
                    <div>
                      <span className="text-muted text-sm">Atanan:</span>
                      <p className="font-medium">{ticket.assignee.displayName}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Creator Info */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-heading mb-4">Oluşturan</h3>
                <div className="space-y-2">
                  <Link
                    href={`/users/${ticket.creator.id}`}
                    className="text-primary-600 hover:text-primary-700 font-medium block"
                  >
                    {ticket.creator.displayName}
                  </Link>
                  <p className="text-sm text-muted">{ticket.creator.email}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-heading mb-4">İşlemler</h3>
                <div className="space-y-2">
                  <Button variant="secondary" onClick={() => setShowStatusModal(true)}
                    className="w-full px-4 py-2 bg-primary-600 text-heading rounded-lg hover:bg-primary-700 transition-colors">
                    Durum Güncelle
                  </Button>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                  <ClockIcon className="w-5 h-5" />
                  Zaman Çizelgesi
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Oluşturulma</p>
                    <p className="text-xs text-muted">
                      {new Date(ticket.createdAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Son Güncelleme</p>
                    <p className="text-xs text-muted">
                      {new Date(ticket.updatedAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  {ticket.resolvedAt && (
                    <div>
                      <p className="text-sm font-medium">Çözülme</p>
                      <p className="text-xs text-muted">
                        {new Date(ticket.resolvedAt).toLocaleString('tr-TR')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Reply Modal */}
        {showReplyModal && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-heading mb-4">Yanıt Ver</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-body mb-2">
                  Mesaj *
                </label>
                <Textarea value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  rows={6}
                  placeholder="Yanıtınızı yazın..." />
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => {
                    setShowReplyModal(false);
                    setReplyMessage('');
                  }}
                  className="flex-1 px-4 text-body hover:bg-surface"
                  disabled={processing}>
                  İptal
                </Button>
                <Button variant="secondary" onClick={handleReply}
                  className="flex-1 px-4 py-2 bg-primary-600 text-heading rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  disabled={processing}>
                  {processing ? 'İşleniyor...' : 'Gönder'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Status Update Modal */}
        {showStatusModal && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface-elevated rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-heading mb-4">Durum Güncelle</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-body mb-2">
                  Yeni Durum
                </label>
                <Select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value="open">Açık</option>
                  <option value="in_progress">İşlemde</option>
                  <option value="waiting_customer">Müşteri Bekleniyor</option>
                  <option value="resolved">Çözüldü</option>
                  <option value="closed">Kapatıldı</option>
                </Select>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setShowStatusModal(false)}
                  className="flex-1 px-4 text-body hover:bg-surface"
                  disabled={processing}>
                  İptal
                </Button>
                <Button variant="secondary" onClick={handleStatusUpdate}
                  className="flex-1 px-4 py-2 bg-primary-600 text-heading rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  disabled={processing}>
                  {processing ? 'İşleniyor...' : 'Güncelle'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
