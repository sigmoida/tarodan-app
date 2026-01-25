'use client';

import React, { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import { toast } from 'react-hot-toast';
import {
  CheckCircleIcon,
  XCircleIcon,
  FlagIcon,
  CubeIcon,
  ChatBubbleLeftIcon,
  StarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import Image from 'next/image';

interface ModerationItem {
  id: string;
  type: 'product' | 'message' | 'review';
  title: string;
  description: string;
  imageUrl?: string;
  price?: number;
  score?: number;
  seller?: { id: string; displayName: string; email: string };
  sender?: { id: string; displayName: string; email: string };
  reviewer?: { id: string; displayName: string; email: string };
  reviewed?: { id: string; displayName: string; email: string };
  category?: string;
  conversationId?: string;
  createdAt: string;
  status: string;
}

interface ModerationStats {
  pendingProducts: number;
  reportedMessages: number;
  recentReviews: number;
  flaggedUsers: number;
  totalPending: number;
}

const ModerationPage = () => {
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  
  // Reject modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ModerationItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');
  
  // Flag modal state
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagPriority, setFlagPriority] = useState('normal');

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadQueue();
  }, [selectedTab, page]);

  const loadStats = async () => {
    try {
      const response = await adminApi.get('/admin/moderation/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Stats load error:', error);
    }
  };

  const loadQueue = async () => {
    setLoading(true);
    try {
      const type = selectedTab === 'all' ? undefined : selectedTab;
      const response = await adminApi.get('/admin/moderation/queue', {
        params: { type, page, pageSize: 20 },
      });
      setItems(response.data.data || []);
      setTotalPages(response.data.meta?.totalPages || 1);
      setTotal(response.data.meta?.total || 0);
    } catch (error) {
      console.error('Queue load error:', error);
      toast.error('Moderasyon kuyruğu yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (item: ModerationItem) => {
    try {
      await adminApi.post(`/admin/moderation/${item.type}/${item.id}/approve`, { notes: '' });
      toast.success('Öğe onaylandı');
      loadQueue();
      loadStats();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Onaylama başarısız');
    }
  };

  const handleRejectClick = (item: ModerationItem) => {
    setSelectedItem(item);
    setRejectReason('');
    setRejectNotes('');
    setRejectModalOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!selectedItem || !rejectReason.trim()) {
      toast.error('Red sebebi gereklidir');
      return;
    }
    try {
      await adminApi.post(`/admin/moderation/${selectedItem.type}/${selectedItem.id}/reject`, {
        reason: rejectReason,
        notes: rejectNotes,
      });
      toast.success('Öğe reddedildi');
      setRejectModalOpen(false);
      setSelectedItem(null);
      loadQueue();
      loadStats();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Reddetme başarısız');
    }
  };

  const handleFlagClick = (item: ModerationItem) => {
    setSelectedItem(item);
    setFlagReason('');
    setFlagPriority('normal');
    setFlagModalOpen(true);
  };

  const handleFlagConfirm = async () => {
    if (!selectedItem || !flagReason.trim()) {
      toast.error('İşaretleme sebebi gereklidir');
      return;
    }
    try {
      await adminApi.post(`/admin/moderation/${selectedItem.type}/${selectedItem.id}/flag`, {
        reason: flagReason,
        priority: flagPriority,
      });
      toast.success('Öğe işaretlendi');
      setFlagModalOpen(false);
      setSelectedItem(null);
      loadQueue();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşaretleme başarısız');
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'product':
        return <CubeIcon className="h-5 w-5" />;
      case 'message':
        return <ChatBubbleLeftIcon className="h-5 w-5" />;
      case 'review':
        return <StarIcon className="h-5 w-5" />;
      default:
        return <CubeIcon className="h-5 w-5" />;
    }
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'product':
        return 'bg-blue-500/20 text-blue-400';
      case 'message':
        return 'bg-purple-500/20 text-purple-400';
      case 'review':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const tabs = [
    { id: 'all', name: 'Tümü' },
    { id: 'product', name: 'Ürünler' },
    { id: 'message', name: 'Mesajlar' },
    { id: 'review', name: 'Değerlendirmeler' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Moderasyon Kuyruğu</h1>
            <p className="text-gray-400 mt-1">İçerik moderasyonu ve onay işlemleri</p>
          </div>
          <button
            onClick={() => { loadQueue(); loadStats(); }}
            className="flex items-center px-4 py-2 bg-dark-700 text-gray-300 rounded-lg hover:bg-dark-600 transition-colors"
          >
            <ArrowPathIcon className="h-5 w-5 mr-2" />
            Yenile
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="admin-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Bekleyen Ürünler</p>
                <p className="text-2xl font-bold text-white mt-1">{stats?.pendingProducts || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-500/20">
                <CubeIcon className="h-6 w-6 text-blue-400" />
              </div>
            </div>
          </div>
          <div className="admin-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Raporlanan Mesajlar</p>
                <p className="text-2xl font-bold text-white mt-1">{stats?.reportedMessages || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-purple-500/20">
                <ChatBubbleLeftIcon className="h-6 w-6 text-purple-400" />
              </div>
            </div>
          </div>
          <div className="admin-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Son 7 Gün Değerlendirme</p>
                <p className="text-2xl font-bold text-white mt-1">{stats?.recentReviews || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-yellow-500/20">
                <StarIcon className="h-6 w-6 text-yellow-400" />
              </div>
            </div>
          </div>
          <div className="admin-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Toplam Bekleyen</p>
                <p className="text-2xl font-bold text-orange-400 mt-1">{stats?.totalPending || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-orange-500/20">
                <ExclamationTriangleIcon className="h-6 w-6 text-orange-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Moderation Queue */}
        <div className="admin-card">
          <h3 className="text-lg font-semibold text-white mb-4">Moderasyon Kuyruğu</h3>
          
          {/* Tabs */}
          <div className="flex space-x-2 mb-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setSelectedTab(tab.id); setPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedTab === tab.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-dark-700 text-gray-400 hover:bg-dark-600'
                }`}
              >
                {tab.name}
              </button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircleIcon className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold text-white">Kuyruk Boş</h3>
              <p className="text-gray-400">Şu anda bekleyen moderasyon öğesi bulunmuyor.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="flex items-start gap-4 p-4 bg-dark-700 rounded-lg hover:bg-dark-600 transition-colors"
                >
                  {/* Image/Icon */}
                  <div className="flex-shrink-0">
                    {item.imageUrl ? (
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden">
                        <Image
                          src={item.imageUrl}
                          alt={item.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-dark-600 flex items-center justify-center">
                        {getTypeIcon(item.type)}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getTypeBadgeColor(item.type)}`}>
                        {getTypeIcon(item.type)}
                        <span className="ml-1">
                          {item.type === 'product' ? 'Ürün' : 
                           item.type === 'message' ? 'Mesaj' : 'Değerlendirme'}
                        </span>
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                        item.status === 'reported' ? 'bg-red-500/20 text-red-400' : 
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {item.status === 'pending' ? 'Bekliyor' :
                         item.status === 'reported' ? 'Raporlandı' : item.status}
                      </span>
                    </div>
                    
                    <h4 className="font-medium text-white truncate">{item.title}</h4>
                    <p className="text-sm text-gray-400 line-clamp-2">{item.description}</p>

                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {item.seller && (
                        <span>Satıcı: {item.seller.displayName || item.seller.email}</span>
                      )}
                      {item.sender && (
                        <span>Gönderen: {item.sender.displayName || item.sender.email}</span>
                      )}
                      {item.reviewer && (
                        <span>Yorumcu: {item.reviewer.displayName || item.reviewer.email}</span>
                      )}
                      {item.price !== undefined && (
                        <span>Fiyat: {item.price.toLocaleString('tr-TR')} ₺</span>
                      )}
                      {item.score !== undefined && (
                        <span>Puan: {item.score}/5</span>
                      )}
                      {item.category && (
                        <span>Kategori: {item.category}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        {formatDate(item.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleApprove(item)}
                      className="flex items-center px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                    >
                      <CheckCircleIcon className="h-4 w-4 mr-1" />
                      Onayla
                    </button>
                    <button
                      onClick={() => handleRejectClick(item)}
                      className="flex items-center px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                    >
                      <XCircleIcon className="h-4 w-4 mr-1" />
                      Reddet
                    </button>
                    <button
                      onClick={() => handleFlagClick(item)}
                      className="flex items-center px-3 py-2 bg-dark-600 text-gray-300 rounded-lg hover:bg-dark-500 transition-colors text-sm"
                    >
                      <FlagIcon className="h-4 w-4 mr-1" />
                      İşaretle
                    </button>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-gray-400">
                    Toplam {total} öğe, Sayfa {page}/{totalPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                      className="px-4 py-2 bg-dark-700 text-gray-300 rounded-lg hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Önceki
                    </button>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                      className="px-4 py-2 bg-dark-700 text-gray-300 rounded-lg hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-dark-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-2">İçeriği Reddet</h3>
            <p className="text-gray-400 text-sm mb-4">
              {selectedItem?.title} içeriğini reddetmek istediğinize emin misiniz?
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Red Sebebi *</label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="">Sebep seçin</option>
                  <option value="inappropriate">Uygunsuz İçerik</option>
                  <option value="spam">Spam</option>
                  <option value="fake">Sahte/Yanıltıcı</option>
                  <option value="duplicate">Tekrarlayan İçerik</option>
                  <option value="copyright">Telif Hakkı İhlali</option>
                  <option value="other">Diğer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Ek Notlar</label>
                <textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="İsteğe bağlı ek notlar..."
                  rows={3}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="px-4 py-2 bg-dark-700 text-gray-300 rounded-lg hover:bg-dark-600 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={!rejectReason}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Reddet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flag Modal */}
      {flagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-dark-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-2">İçeriği İşaretle</h3>
            <p className="text-gray-400 text-sm mb-4">
              {selectedItem?.title} içeriğini öncelikli inceleme için işaretleyin.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">İşaretleme Sebebi *</label>
                <textarea
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="İşaretleme sebebini açıklayın..."
                  rows={3}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Öncelik</label>
                <select
                  value={flagPriority}
                  onChange={(e) => setFlagPriority(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                >
                  <option value="low">Düşük</option>
                  <option value="normal">Normal</option>
                  <option value="high">Yüksek</option>
                  <option value="urgent">Acil</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setFlagModalOpen(false)}
                className="px-4 py-2 bg-dark-700 text-gray-300 rounded-lg hover:bg-dark-600 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleFlagConfirm}
                disabled={!flagReason}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                İşaretle
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default ModerationPage;
