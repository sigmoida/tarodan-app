'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import { MagnifyingGlassIcon, CheckIcon, XMarkIcon, EyeIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface Message {
  id: string;
  content: string;
  originalContent: string;
  sender: { displayName: string; email: string };
  receiver: { displayName: string; email: string };
  status: 'pending' | 'approved' | 'rejected';
  flaggedReason: string;
  createdAt: string;
  threadId: string;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    // API only returns pending messages, so only load when filter is 'pending' or 'all'
    if (filter === 'pending' || filter === 'all') {
      loadMessages();
    } else {
      // For approved/rejected, show empty for now (API doesn't support these filters yet)
      setMessages([]);
      setTotal(0);
      setLoading(false);
    }
  }, [page, filter]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getMessages({ page, pageSize: 20 });
      // API returns: { messages: [{ id, senderName, receiverName, originalContent, flaggedReason, ... }], total, page, pageSize }
      const apiMessages = response.data.messages || [];
      // Map API response to frontend format
      const mappedMessages: Message[] = apiMessages.map((m: any) => ({
        id: m.id,
        content: m.originalContent || '',
        originalContent: m.originalContent || '',
        sender: { displayName: m.senderName || 'Bilinmeyen', email: '' },
        receiver: { displayName: m.receiverName || 'Bilinmeyen', email: '' },
        status: 'pending' as const, // API only returns pending messages
        flaggedReason: m.flaggedReason || '',
        createdAt: m.createdAt,
        threadId: m.threadId,
      }));
      setMessages(mappedMessages);
      setTotal(response.data.total || 0);
    } catch (error) {
      console.error('Load messages error:', error);
      toast.error('Mesajlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (messageId: string) => {
    try {
      await adminApi.approveMessage(messageId);
      toast.success('Mesaj onaylandı');
      loadMessages();
    } catch (error) {
      toast.error('İşlem başarısız');
    }
  };

  const handleReject = async (messageId: string) => {
    const reason = prompt('Red nedeni:');
    if (!reason || !reason.trim()) {
      toast.error('Red nedeni gereklidir');
      return;
    }
    try {
      await adminApi.rejectMessage(messageId, reason);
      toast.success('Mesaj reddedildi');
      loadMessages();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    }
  };

  const getStatusBadge = (status: string, flaggedReason: string) => {
    if (status === 'pending') {
      return <span className="badge badge-warning">⏳ Onay Bekliyor</span>;
    }
    if (status === 'approved') {
      return <span className="badge badge-success">✓ Onaylandı</span>;
    }
    if (status === 'rejected') {
      return <span className="badge badge-danger">✗ Reddedildi</span>;
    }
    return null;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Mesaj Moderation</h1>
          <p className="text-gray-400 mt-1">
            {filter === 'pending' || filter === 'all' ? `${total} mesaj onay bekliyor` : 'Bu filtre henüz desteklenmiyor'}
          </p>
        </div>

        <div className="flex gap-4">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === f
                  ? 'bg-primary-500 text-white'
                  : 'bg-dark-700 text-gray-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'Tümü' : f === 'pending' ? 'Bekleyenler' : f === 'approved' ? 'Onaylananlar' : 'Reddedilenler'}
            </button>
          ))}
        </div>

        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Gönderen</th>
                  <th>Alıcı</th>
                  <th>Mesaj</th>
                  <th>Uyarılar</th>
                  <th>Durum</th>
                  <th>Tarih</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
                    </td>
                  </tr>
                ) : messages.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">
                      Mesaj bulunamadı
                    </td>
                  </tr>
                ) : (
                  messages.map((message) => (
                    <tr key={message.id}>
                      <td>
                        <div>
                          <p className="font-medium text-white">{message.sender.displayName}</p>
                          <p className="text-xs text-gray-400">{message.sender.email}</p>
                        </div>
                      </td>
                      <td>
                        <div>
                          <p className="font-medium text-white">{message.receiver.displayName}</p>
                          <p className="text-xs text-gray-400">{message.receiver.email}</p>
                        </div>
                      </td>
                      <td>
                        <p className="text-sm text-gray-300 line-clamp-2 max-w-md">
                          {message.originalContent || message.content}
                        </p>
                      </td>
                      <td>
                        {message.flaggedReason ? (
                          <span className="badge badge-warning text-xs">
                            {message.flaggedReason}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td>{getStatusBadge(message.status, message.flaggedReason)}</td>
                      <td className="text-sm text-gray-400">
                        {new Date(message.createdAt).toLocaleDateString('tr-TR')}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {message.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(message.id)}
                                className="p-2 text-green-400 hover:bg-green-500/10 rounded-lg"
                                title="Onayla"
                              >
                                <CheckIcon className="h-5 w-5" />
                              </button>
                              <button
                                onClick={() => handleReject(message.id)}
                                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                                title="Reddet"
                              >
                                <XMarkIcon className="h-5 w-5" />
                              </button>
                            </>
                          )}
                          <button
                            className="p-2 text-gray-400 hover:text-white hover:bg-dark-700 rounded-lg"
                            title="Detay"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">Sayfa {page} / {Math.ceil(total / 20)}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary disabled:opacity-50"
            >
              Önceki
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / 20)}
              className="btn-secondary disabled:opacity-50"
            >
              Sonraki
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
