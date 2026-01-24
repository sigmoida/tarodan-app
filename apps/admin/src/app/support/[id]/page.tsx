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
import AdminLayout from '@/components/AdminLayout';

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
  open: { label: 'Açık', color: 'text-blue-600', bg: 'bg-blue-100' },
  in_progress: { label: 'İşlemde', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  waiting_customer: { label: 'Müşteri Bekleniyor', color: 'text-orange-600', bg: 'bg-orange-100' },
  resolved: { label: 'Çözüldü', color: 'text-green-600', bg: 'bg-green-100' },
  closed: { label: 'Kapatıldı', color: 'text-gray-600', bg: 'bg-gray-100' },
};

const priorityConfig: Record<string, { label: string; color: string; bg: string }> = {
  low: { label: 'Düşük', color: 'text-gray-600', bg: 'bg-gray-100' },
  medium: { label: 'Orta', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  high: { label: 'Yüksek', color: 'text-orange-600', bg: 'bg-orange-100' },
  urgent: { label: 'Acil', color: 'text-red-600', bg: 'bg-red-100' },
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
      console.error('Ticket load error:', error);
      toast.error(error.response?.data?.message || 'Destek talebi yüklenemedi');
      router.push('/admin/support');
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
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Yükleniyor...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!ticket) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">Destek talebi bulunamadı</p>
        </div>
      </AdminLayout>
    );
  }

  const statusInfo = statusConfig[ticket.status] || statusConfig.open;
  const priorityInfo = priorityConfig[ticket.priority] || priorityConfig.medium;

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/admin/support"
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">{ticket.subject}</h1>
              <p className="text-sm text-gray-500">#{ticket.ticketNumber}</p>
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
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <ChatBubbleLeftRightIcon className="w-5 h-5" />
                    Mesajlar
                  </h2>
                  <button
                    onClick={() => setShowReplyModal(true)}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Yanıtla
                  </button>
                </div>
                <div className="space-y-4">
                  {ticket.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`p-4 rounded-lg ${
                        message.isInternal
                          ? 'bg-yellow-50 border border-yellow-200'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{message.sender.displayName}</span>
                          {message.isInternal && (
                            <span className="text-xs px-2 py-1 bg-yellow-200 text-yellow-800 rounded">
                              İç Not
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(message.createdAt).toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <p className="text-gray-700 whitespace-pre-wrap">{message.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Ticket Info */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Talep Bilgileri</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-gray-600 text-sm">Kategori:</span>
                    <p className="font-medium capitalize">{ticket.category}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 text-sm">Öncelik:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${priorityInfo.color} ${priorityInfo.bg}`}>
                      {priorityInfo.label}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600 text-sm">Durum:</span>
                    <span className={`ml-2 px-2 py-1 rounded text-xs ${statusInfo.color} ${statusInfo.bg}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  {ticket.assignee && (
                    <div>
                      <span className="text-gray-600 text-sm">Atanan:</span>
                      <p className="font-medium">{ticket.assignee.displayName}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Creator Info */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Oluşturan</h3>
                <div className="space-y-2">
                  <Link
                    href={`/admin/users/${ticket.creator.id}`}
                    className="text-primary-600 hover:text-primary-700 font-medium block"
                  >
                    {ticket.creator.displayName}
                  </Link>
                  <p className="text-sm text-gray-600">{ticket.creator.email}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">İşlemler</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setShowStatusModal(true)}
                    className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Durum Güncelle
                  </button>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <ClockIcon className="w-5 h-5" />
                  Zaman Çizelgesi
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Oluşturulma</p>
                    <p className="text-xs text-gray-500">
                      {new Date(ticket.createdAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Son Güncelleme</p>
                    <p className="text-xs text-gray-500">
                      {new Date(ticket.updatedAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  {ticket.resolvedAt && (
                    <div>
                      <p className="text-sm font-medium">Çözülme</p>
                      <p className="text-xs text-gray-500">
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Yanıt Ver</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mesaj *
                </label>
                <textarea
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={6}
                  placeholder="Yanıtınızı yazın..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowReplyModal(false);
                    setReplyMessage('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={processing}
                >
                  İptal
                </button>
                <button
                  onClick={handleReply}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  disabled={processing}
                >
                  {processing ? 'İşleniyor...' : 'Gönder'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status Update Modal */}
        {showStatusModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Durum Güncelle</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Yeni Durum
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="open">Açık</option>
                  <option value="in_progress">İşlemde</option>
                  <option value="waiting_customer">Müşteri Bekleniyor</option>
                  <option value="resolved">Çözüldü</option>
                  <option value="closed">Kapatıldı</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={processing}
                >
                  İptal
                </button>
                <button
                  onClick={handleStatusUpdate}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  disabled={processing}
                >
                  {processing ? 'İşleniyor...' : 'Güncelle'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
