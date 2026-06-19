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
import { AdminTabs } from '@/components/AdminTabs';
import { PageHeader } from '@/components/admin-list';
import { Pagination } from '@/components/Pagination';
import { useAdminResource } from '@/hooks/useAdminResource';

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
  // AI görsel moderasyon sonuçları (yalnızca ürünlerde; null = denetlenmedi)
  aiCheckStatus?: string | null;
  aiRelevanceScore?: number | null;
  aiNsfwScore?: number | null;
  aiCheckReason?: string | null;
}

interface ModerationStats {
  pendingProducts: number;
  reportedMessages: number;
  recentReviews: number;
  flaggedUsers: number;
  totalPending: number;
}

const moderationTabs = [
  { key: 'all', label: 'Tümü' },
  { key: 'product', label: 'Ürünler' },
  { key: 'message', label: 'Mesajlar' },
  { key: 'review', label: 'Değerlendirmeler' },
];

const moderationTypeConfig: Record<string, StatusConfig> = {
  product: { label: 'Ürün', variant: 'info' },
  message: { label: 'Mesaj', variant: 'primary' },
  review: { label: 'Değerlendirme', variant: 'warning' },
  other: { label: 'Diğer', variant: 'secondary' },
};

const ModerationPage = () => {
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [stats, setStats] = useState<ModerationStats | null>(null);

  // Reject modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ModerationItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');

  // Flag modal state
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagPriority, setFlagPriority] = useState('normal');

  // ── Moderasyon kuyruğu — useAdminResource ile yönetim ─────────────────────
  // queryKey'e selectedTab katıyoruz → sekme değişince otomatik yeni fetch.
  // Backend: GET /admin/moderation/queue?type=...&page=...&pageSize=20
  // pageSize → useAdminResource limit parametresine karşılık gelir;
  // ancak backend "pageSize" bekliyor. fetcher içinde rename ediyoruz.
  const r = useAdminResource<ModerationItem>({
    queryKey: `moderation:${selectedTab}`,
    fetcher: ({ page, limit, ...rest }) =>
      adminApi.get('/admin/moderation/queue', {
        params: {
          type: selectedTab === 'all' ? undefined : selectedTab,
          page,
          pageSize: limit,
          ...rest,
        },
      }),
    limit: 20,
    errorMessage: 'Moderasyon kuyruğu yüklenemedi',
  });

  // ── İstatistikler — sadece mount'ta (ve manuel yenilede) yükle ───────────
  const loadStats = async () => {
    try {
      const response = await adminApi.get('/admin/moderation/stats');
      setStats(response.data);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Stats load error:', error);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  // ── Sekme değişimi ────────────────────────────────────────────────────────
  const handleTabChange = (key: string) => {
    setSelectedTab(key);
    r.setPage(1);
  };

  // ── Aksiyonlar ─────────────────────────────────────────────────────────────
  const handleApprove = async (item: ModerationItem) => {
    try {
      await adminApi.post(`/admin/moderation/${item.type}/${item.id}/approve`, { notes: '' });
      toast.success('Öğe onaylandı');
      r.refetch();
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
      r.refetch();
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
      r.refetch();
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader title="Moderasyon Kuyruğu" description="İçerik moderasyonu ve onay işlemleri">
          <Button
            variant="secondary"
            onClick={() => { r.refetch(); loadStats(); }}
            className="flex items-center shrink-0 px-4 py-2 bg-surface-alt text-muted rounded-lg hover:bg-surface-alt transition-colors"
          >
            <ArrowPathIcon className="h-5 w-5 mr-2 shrink-0" />
            Yenile
          </Button>
        </PageHeader>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="admin-card">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted truncate">Bekleyen Ürünler</p>
                <p className="text-2xl font-bold text-heading mt-1 truncate">
                  {stats?.pendingProducts || 0}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-info-500/20 shrink-0">
                <CubeIcon className="h-6 w-6 text-info-700" />
              </div>
            </div>
          </div>
          <div className="admin-card">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted truncate">Raporlanan Mesajlar</p>
                <p className="text-2xl font-bold text-heading mt-1 truncate">
                  {stats?.reportedMessages || 0}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-primary-500/20 shrink-0">
                <ChatBubbleLeftIcon className="h-6 w-6 text-primary-700" />
              </div>
            </div>
          </div>
          <div className="admin-card">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted truncate">Son 7 Gün Değerlendirme</p>
                <p className="text-2xl font-bold text-heading mt-1 truncate">
                  {stats?.recentReviews || 0}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-warning-500/20 shrink-0">
                <StarIcon className="h-6 w-6 text-warning-700" />
              </div>
            </div>
          </div>
          <div className="admin-card">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted truncate">Toplam Bekleyen</p>
                <p className="text-2xl font-bold text-primary-700 mt-1 truncate">
                  {stats?.totalPending || 0}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-primary-500/20 shrink-0">
                <ExclamationTriangleIcon className="h-6 w-6 text-primary-700" />
              </div>
            </div>
          </div>
        </div>

        {/* Moderation Queue */}
        <div className="admin-card">
          <h3 className="text-lg font-semibold text-heading mb-4">Moderasyon Kuyruğu</h3>

          {/* Tabs */}
          <AdminTabs
            tabs={moderationTabs}
            value={selectedTab}
            onChange={handleTabChange}
            className="mb-6"
          />

          {/* Content */}
          {r.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="xl" />
            </div>
          ) : r.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircleIcon className="h-12 w-12 text-success-500 mb-4" />
              <h3 className="text-lg font-semibold text-heading">Kuyruk Boş</h3>
              <p className="text-muted">Şu anda bekleyen moderasyon öğesi bulunmuyor.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {r.rows.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="flex items-start gap-4 p-4 bg-surface-alt rounded-lg hover:bg-surface-alt transition-colors"
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
                      <div className="w-16 h-16 rounded-lg bg-surface-alt flex items-center justify-center">
                        {getTypeIcon(item.type)}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={item.type} config={moderationTypeConfig} />
                      <span
                        className={`shrink-0 px-2 py-1 rounded text-xs font-medium ${
                          item.status === 'pending'
                            ? 'bg-warning-500/20 text-warning-700'
                            : item.status === 'reported'
                            ? 'bg-danger-500/20 text-danger-600'
                            : 'bg-muted/20 text-muted'
                        }`}
                      >
                        {item.status === 'pending'
                          ? 'Bekliyor'
                          : item.status === 'reported'
                          ? 'Raporlandı'
                          : item.status}
                      </span>
                      {item.aiCheckStatus && (
                        <span
                          className={`shrink-0 px-2 py-1 rounded text-xs font-medium ${
                            item.aiCheckStatus === 'flagged'
                              ? 'bg-danger-500/20 text-danger-600'
                              : item.aiCheckStatus === 'review'
                              ? 'bg-warning-500/20 text-warning-700'
                              : 'bg-success-500/20 text-success-700'
                          }`}
                          title={`AI · ilgililik: ${item.aiRelevanceScore ?? '—'} · NSFW: ${item.aiNsfwScore ?? '—'}${item.aiCheckReason ? ` · ${item.aiCheckReason}` : ''}`}
                        >
                          {item.aiCheckStatus === 'flagged'
                            ? `AI: Uygunsuz şüphesi${item.aiNsfwScore != null ? ` (%${Math.round(item.aiNsfwScore * 100)})` : ''}`
                            : item.aiCheckStatus === 'review'
                            ? `AI: Düşük ilgililik${item.aiRelevanceScore != null ? ` (%${Math.round(item.aiRelevanceScore * 100)})` : ''}`
                            : 'AI: Temiz'}
                        </span>
                      )}
                    </div>

                    <h4 className="font-medium text-heading truncate">{item.title}</h4>
                    <p className="text-sm text-muted line-clamp-2">{item.description}</p>

                    <div className="flex items-center gap-4 mt-2 text-xs text-muted">
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
                        <span>
                          Fiyat:{' '}
                          {getProductEffectivePrice({ price: item.price }).toLocaleString('tr-TR')}{' '}
                          ₺
                        </span>
                      )}
                      {item.score !== undefined && <span>Puan: {item.score}/5</span>}
                      {item.category && <span>Kategori: {item.category}</span>}
                      <span className="flex items-center gap-1">
                        <ClockIcon className="h-3 w-3 shrink-0" />
                        {formatDate(item.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button variant="success" size="sm" onClick={() => handleApprove(item)}>
                      <CheckCircleIcon className="h-4 w-4 mr-1" />
                      Onayla
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleRejectClick(item)}>
                      <XCircleIcon className="h-4 w-4 mr-1" />
                      Reddet
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleFlagClick(item)}
                      className="flex items-center px-3 py-2 bg-surface-alt text-muted rounded-lg hover:bg-surface-alt transition-colors text-sm"
                    >
                      <FlagIcon className="h-4 w-4 mr-1" />
                      İşaretle
                    </Button>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {r.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted">
                    Toplam {r.total} öğe, Sayfa {r.page}/{r.totalPages}
                  </p>
                  <Pagination
                    page={r.page}
                    totalPages={r.totalPages}
                    onPageChange={r.setPage}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-heading/50">
          <div className="bg-surface-elevated rounded-lg px-6 pb-6 pt-5 w-full max-w-md">
            <h3 className="text-lg font-semibold text-heading mb-2 leading-tight">
              İçeriği Reddet
            </h3>
            <p className="text-muted text-sm mb-4">
              {selectedItem?.title} içeriğini reddetmek istediğinize emin misiniz?
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Red Sebebi *
                </label>
                <Select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="bg-surface-alt"
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
                <label className="block text-sm font-medium text-muted mb-1">Ek Notlar</label>
                <Textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="İsteğe bağlı ek notlar..."
                  rows={3}
                  className="bg-surface-alt text-heading"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" size="md" onClick={() => setRejectModalOpen(false)}>
                İptal
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handleRejectConfirm}
                disabled={!rejectReason}
              >
                Reddet
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Flag Modal */}
      {flagModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-heading/50">
          <div className="bg-surface-elevated rounded-lg px-6 pb-6 pt-5 w-full max-w-md">
            <h3 className="text-lg font-semibold text-heading mb-2 leading-tight">
              İçeriği İşaretle
            </h3>
            <p className="text-muted text-sm mb-4">
              {selectedItem?.title} içeriğini öncelikli inceleme için işaretleyin.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  İşaretleme Sebebi *
                </label>
                <Textarea
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  placeholder="İşaretleme sebebini açıklayın..."
                  rows={3}
                  className="bg-surface-alt text-heading"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-1">Öncelik</label>
                <Select
                  value={flagPriority}
                  onChange={(e) => setFlagPriority(e.target.value)}
                  className="bg-surface-alt"
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
              <Button
                variant="primary"
                size="md"
                onClick={handleFlagConfirm}
                disabled={!flagReason}
              >
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
