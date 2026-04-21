'use client';

import React, { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { toast } from 'react-hot-toast';
import { Button, Select, Spinner, StatusBadge, Textarea } from '@tarodan/ui';
import type { StatusConfig } from '@tarodan/ui';
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
      if (process.env.NODE_ENV === 'development') console.error('Stats load error:', error);
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
      if (process.env.NODE_ENV === 'development') console.error('Queue load error:', error);
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

  const moderationTypeConfig: Record<string, StatusConfig> = {
    product: { label: 'Ürün', variant: 'info' },
    message: { label: 'Mesaj', variant: 'primary' },
    review: { label: 'Değerlendirme', variant: 'warning' },
    other: { label: 'Diğer', variant: 'secondary' },
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
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Moderasyon Kuyruğu</h1>
            <p className="text-gray-500 mt-1">İçerik moderasyonu ve onay işlemleri</p>
          </div>
          <Button variant="secondary" onClick={() => { loadQueue(); loadStats(); }}
            className="flex items-center px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowPathIcon className="h-5 w-5 mr-2" />
            Yenile
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="admin-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Bekleyen Ürünler</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.pendingProducts || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-info-500/20">
                <CubeIcon className="h-6 w-6 text-info-700" />
              </div>
            </div>
          </div>
          <div className="admin-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Raporlanan Mesajlar</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.reportedMessages || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-primary-500/20">
                <ChatBubbleLeftIcon className="h-6 w-6 text-primary-700" />
              </div>
            </div>
          </div>
          <div className="admin-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Son 7 Gün Değerlendirme</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats?.recentReviews || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-warning-500/20">
                <StarIcon className="h-6 w-6 text-warning-700" />
              </div>
            </div>
          </div>
          <div className="admin-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Toplam Bekleyen</p>
                <p className="text-2xl font-bold text-primary-700 mt-1">{stats?.totalPending || 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-primary-500/20">
                <ExclamationTriangleIcon className="h-6 w-6 text-primary-700" />
              </div>
            </div>
          </div>
        </div>

        {/* Moderation Queue */}
        <div className="admin-card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Moderasyon Kuyruğu</h3>
          
          {/* Tabs */}
          <div className="flex space-x-2 mb-6">
            {tabs.map((tab) => (
              <Button variant="secondary" key={tab.id}
                onClick={() => { setSelectedTab(tab.id); setPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedTab === tab.id
                    ? 'bg-primary-500 text-gray-900'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-100'
                }`}>
                {tab.name}
              </Button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="xl" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircleIcon className="h-12 w-12 text-success-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900">Kuyruk Boş</h3>
              <p className="text-gray-500">Şu anda bekleyen moderasyon öğesi bulunmuyor.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="flex items-start gap-4 p-4 bg-gray-100 rounded-lg hover:bg-gray-100 transition-colors"
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
                      <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center">
                        {getTypeIcon(item.type)}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={item.type} config={moderationTypeConfig} />
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        item.status === 'pending' ? 'bg-warning-500/20 text-warning-700' :
                        item.status === 'reported' ? 'bg-danger-500/20 text-danger-600' : 
                        'bg-gray-500/20 text-gray-500'
                      }`}>
                        {item.status === 'pending' ? 'Bekliyor' :
                         item.status === 'reported' ? 'Raporlandı' : item.status}
                      </span>
                    </div>
                    
                    <h4 className="font-medium text-gray-900 truncate">{item.title}</h4>
                    <p className="text-sm text-gray-500 line-clamp-2">{item.description}</p>

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
                        <span>Fiyat: {getProductEffectivePrice({ price: item.price }).toLocaleString('tr-TR')} ₺</span>
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
                    <Button variant="success" size="sm" onClick={() => handleApprove(item)}>
                      <CheckCircleIcon className="h-4 w-4 mr-1" />
                      Onayla
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleRejectClick(item)}>
                      <XCircleIcon className="h-4 w-4 mr-1" />
                      Reddet
                    </Button>
                    <Button variant="secondary" onClick={() => handleFlagClick(item)}
                      className="flex items-center px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors text-sm">
                      <FlagIcon className="h-4 w-4 mr-1" />
                      İşaretle
                    </Button>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-gray-500">
                    Toplam {total} öğe, Sayfa {page}/{totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="secondary" disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                      className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      Önceki
                    </Button>
                    <Button variant="secondary" disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                      className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      Sonraki
                    </Button>
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
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">İçeriği Reddet</h3>
            <p className="text-gray-500 text-sm mb-4">
              {selectedItem?.title} içeriğini reddetmek istediğinize emin misiniz?
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Red Sebebi *</label>
                <Select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="bg-gray-100"
                >
                  <option value="">Sebep seçin</option>
                  <option value="inappropriate">Uygunsuz İçerik</option>
                  <option value="spam">Spam</option>
                  <option value="fake">Sahte/Yanıltıcı</option>
                  <option value="duplicate">Tekrarlayan İçerik</option>
                  <option value="copyright">Telif Hakkı İhlali</option>
                  <option value="other">Diğer</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Ek Notlar</label>
                <Textarea value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="İsteğe bağlı ek notlar..."
                  rows={3}
                  className="bg-gray-100 text-gray-900" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" size="md" onClick={() => setRejectModalOpen(false)}>
                İptal
              </Button>
              <Button variant="danger" size="md" onClick={handleRejectConfirm} disabled={!rejectReason}>
                Reddet
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Flag Modal */}
      {flagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">İçeriği İşaretle</h3>
            <p className="text-gray-500 text-sm mb-4">
              {selectedItem?.title} içeriğini öncelikli inceleme için işaretleyin.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">İşaretleme Sebebi *</label>
                <Textarea value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="İşaretleme sebebini açıklayın..."
                  rows={3}
                  className="bg-gray-100 text-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Öncelik</label>
                <Select
                  value={flagPriority}
                  onChange={(e) => setFlagPriority(e.target.value)}
                  className="bg-gray-100"
                >
                  <option value="low">Düşük</option>
                  <option value="normal">Normal</option>
                  <option value="high">Yüksek</option>
                  <option value="urgent">Acil</option>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" size="md" onClick={() => setFlagModalOpen(false)}>
                İptal
              </Button>
              <Button variant="primary" size="md" onClick={handleFlagConfirm} disabled={!flagReason}>
                İşaretle
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ModerationPage;
