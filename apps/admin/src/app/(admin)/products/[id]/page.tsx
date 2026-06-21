'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  CubeIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  PhotoIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { adminApi } from '@/lib/api';
import { AdminTabs } from '@/components/AdminTabs';
import { Button, Spinner, Textarea, productConditionConfig, enumLabel } from '@tarodan/ui';
import { getProductEffectivePrice, isProductOnSaleDisplay, getProductOriginalPriceForDisplay } from '@/lib/productPrice';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useConfirm } from '@/components/ConfirmProvider';
import { ModerationEventsPanel } from '@/components/ModerationEventsPanel';

interface ProductDetail {
  id: string;
  title: string;
  description: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  quantity?: number;
  condition: string;
  status: string;
  category: {
    id: string;
    name: string;
  };
  seller: {
    id: string;
    displayName: string;
    email: string;
  };
  images: Array<{
    id: string;
    url: string;
    sortOrder: number;
  }>;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  rejectionReason?: string;
  // AI görsel moderasyon sonuçları
  aiCheckStatus?: string | null;
  aiRelevanceScore?: number | null;
  aiNsfwScore?: number | null;
  aiCheckReason?: string | null;
}

interface Review {
  id: string;
  score: number;
  title?: string;
  review?: string;
  status: 'pending' | 'approved' | 'rejected' | 'deleted';
  adminReply?: string;
  adminReplyAt?: string;
  createdAt: string;
  isVerifiedPurchase: boolean;
  user: {
    id: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
  };
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Beklemede', color: 'text-warning-600', bg: 'bg-warning-100' },
  active: { label: 'Aktif', color: 'text-success-600', bg: 'bg-success-100' },
  inactive: { label: 'Pasif', color: 'text-muted', bg: 'bg-surface-alt' },
  rejected: { label: 'Reddedildi', color: 'text-danger-600', bg: 'bg-danger-100' },
  reserved: { label: 'Rezerve', color: 'text-info-600', bg: 'bg-info-100' },
  sold: { label: 'Satıldı', color: 'text-primary-600', bg: 'bg-primary-100' },
  deleted: { label: 'Kaldırıldı', color: 'text-danger-600', bg: 'bg-danger-100' },
};

export default function ProductDetailPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approveNote, setApproveNote] = useState('');
  const [processing, setProcessing] = useState(false);

  // Tab and Reviews state
  const [activeTab, setActiveTab] = useState<'info' | 'reviews' | 'ai'>('info');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  useEffect(() => {
    if (productId) {
      loadProduct();
    }
  }, [productId]);

  const loadProduct = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getProduct(productId);
      setProduct(response.data);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Product load error:', error);
      toast.error(error.response?.data?.message || 'Ürün yüklenemedi');
      router.push('/products');
    } finally {
      setLoading(false);
    }
  };

  const loadReviews = async () => {
    setReviewsLoading(true);
    try {
      const response = await adminApi.getReviews({ productId, limit: 50 });
      setReviews(response.data.data || []);
    } catch (error: any) {
      console.error('Failed to load reviews:', error);
      toast.error('Yorumlar yüklenemedi');
    } finally {
      setReviewsLoading(false);
    }
  };

  // Yorum sayısı rozeti ilk render'da doğru görünsün diye yorumları sekme
  // açılmasını beklemeden ürünle birlikte yükle. Aksi halde "Yorumlar" sekmesine
  // girilene kadar rozet 0 görünüyordu.
  useEffect(() => {
    if (productId) {
      loadReviews();
    }
  }, [productId]);

  const handleReviewStatusUpdate = async (reviewId: string, status: string) => {
    try {
      await adminApi.updateReviewStatus(reviewId, status);
      toast.success(`Yorum durumu güncellendi`);
      loadReviews();
    } catch (error: any) {
      toast.error('Güncelleme başarısız');
    }
  };

  const renderStars = (score: number) => (
    <div className="flex text-warning-500">
      {[...Array(5)].map((_, i) => (
        i < score ? <StarIconSolid key={i} className="w-4 h-4" /> : <StarIcon key={i} className="w-4 h-4" />
      ))}
    </div>
  );

  const getReviewStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <span className="px-2 py-1 text-xs bg-success-100 text-success-700 rounded-full">Onaylı</span>;
      case 'pending': return <span className="px-2 py-1 text-xs bg-warning-100 text-warning-700 rounded-full">Bekliyor</span>;
      case 'rejected': return <span className="px-2 py-1 text-xs bg-danger-100 text-danger-700 rounded-full">Reddedildi</span>;
      default: return <span className="px-2 py-1 text-xs bg-surface-alt text-body rounded-full">{status}</span>;
    }
  };

  const handleApprove = async () => {
    setProcessing(true);
    try {
      await adminApi.approveProduct(productId, approveNote || undefined);
      toast.success('Ürün onaylandı');
      setShowApproveModal(false);
      setApproveNote('');
      loadProduct();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Onay işlemi başarısız');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Red nedeni gereklidir');
      return;
    }

    setProcessing(true);
    try {
      await adminApi.rejectProduct(productId, rejectReason);
      toast.success('Ürün reddedildi');
      setShowRejectModal(false);
      setRejectReason('');
      loadProduct();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Red işlemi başarısız');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async () => {
    setProcessing(true);
    try {
      await adminApi.deleteProduct(productId);
      toast.success('Ürün kaldırıldı');
      router.push('/products');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Silme işlemi başarısız');
      setProcessing(false);
    }
  };

  const handleRestore = async () => {
    if (
      !(await confirm({
        title: 'Ürünü geri yükle',
        description:
          'Ürün yeniden onaya (Beklemede) düşecek ve onaylandıktan sonra yayınlanacak.',
        confirmLabel: 'Geri Yükle',
      }))
    )
      return;
    setProcessing(true);
    try {
      await adminApi.restoreProduct(productId);
      toast.success('Ürün geri yüklendi (onay bekliyor)');
      loadProduct();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Geri yükleme başarısız');
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

  if (!product) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Ürün bulunamadı</p>
      </div>
    );
  }

  const statusInfo = statusConfig[product.status] || statusConfig.pending;
  const canApprove = product.status === 'pending';
  const canReject = product.status === 'pending';
  const canRestore = product.status === 'deleted';
  const canDelete =
    product.status !== 'sold' &&
    product.status !== 'reserved' &&
    product.status !== 'deleted';

  return (
      <div className="min-h-screen bg-surface">
        <main className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <button
              type="button"
              onClick={() =>
                window.history.length > 1 ? router.back() : router.push('/products')
              }
              aria-label="Geri"
              className="p-2 hover:bg-border-subtle rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6 text-muted" />
            </button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-heading">{product.title}</h1>
              <p className="text-sm text-muted">Kategori: {product.category.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-4 py-2 rounded-full font-medium ${statusInfo.color} ${statusInfo.bg}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-6">
            <AdminTabs
              tabs={[
                { key: 'info', label: 'Ürün Bilgileri', icon: CubeIcon },
                { key: 'reviews', label: 'Yorumlar', icon: StarIcon, badge: reviews.filter((rv) => rv.status !== 'deleted').length },
                { key: 'ai', label: 'AI Denetim' },
              ]}
              value={activeTab}
              onChange={(k) => setActiveTab(k as 'info' | 'reviews' | 'ai')}
            />
          </div>

          {activeTab === 'info' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-6">
                {/* Images */}
                {product.images && product.images.length > 0 && (
                  <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                    <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                      <PhotoIcon className="w-5 h-5" />
                      Görseller
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {product.images.map((image) => (
                        <div key={image.id} className="aspect-square rounded-lg overflow-hidden bg-surface-alt">
                          <img
                            src={image.url}
                            alt={product.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Product Info */}
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                    <CubeIcon className="w-5 h-5" />
                    Ürün Bilgileri
                  </h2>
                  <div className="space-y-3">
                    <div>
                      <span className="text-muted text-sm">Başlık:</span>
                      <p className="font-medium">{product.title}</p>
                    </div>
                    <div>
                      <span className="text-muted text-sm">Açıklama:</span>
                      <p className="mt-1 whitespace-pre-wrap">{product.description}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                      <div>
                        <span className="text-muted text-sm">Fiyat:</span>
                        {isProductOnSaleDisplay(product) && (
                          <p className="text-muted line-through text-base">
                            ₺{getProductOriginalPriceForDisplay(product).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                        <p className="font-semibold text-lg">
                          ₺{getProductEffectivePrice(product).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted text-sm">Durum:</span>
                        <p className="font-medium">{enumLabel(productConditionConfig, product.condition)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                      <div>
                        <span className="text-muted text-sm">Görüntülenme:</span>
                        <p className="font-medium">{product.viewCount || 0}</p>
                      </div>
                      <div>
                        <span className="text-muted text-sm">Oluşturulma:</span>
                        <p className="text-sm">
                          {new Date(product.createdAt).toLocaleString('tr-TR')}
                        </p>
                      </div>
                    </div>
                    <div className="pt-3 border-t">
                      <span className="text-muted text-sm">Stok:</span>
                      <p className="font-medium text-heading">{product.quantity !== undefined ? product.quantity : 'Belirtilmemiş'}</p>
                    </div>
                    {product.rejectionReason && (
                      <div className="pt-3 border-t">
                        <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg">
                          <p className="text-sm text-danger-800">
                            <strong>Red Nedeni:</strong> {product.rejectionReason}
                          </p>
                        </div>
                      </div>
                    )}
                    {product.aiCheckStatus && (
                      <div className="pt-3 border-t">
                        <span className="text-muted text-sm">
                          AI Görsel Denetimi:
                        </span>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              product.aiCheckStatus === 'flagged'
                                ? 'bg-danger-500/20 text-danger-600'
                                : product.aiCheckStatus === 'review'
                                  ? 'bg-warning-500/20 text-warning-700'
                                  : 'bg-success-500/20 text-success-700'
                            }`}
                          >
                            {product.aiCheckStatus === 'flagged'
                              ? 'Uygunsuz şüphesi'
                              : product.aiCheckStatus === 'review'
                                ? 'Düşük ilgililik (admin incelemesi)'
                                : 'Temiz · oto-onay'}
                          </span>
                          <span className="text-xs text-muted">
                            İlgililik (araç/model): %
                            {Math.round((product.aiRelevanceScore ?? 0) * 100)} ·
                            Uygunsuzluk: %
                            {((product.aiNsfwScore ?? 0) * 100).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Seller Info */}
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-heading mb-4">Satıcı Bilgileri</h2>
                  <div className="space-y-2">
                    <p>
                      <span className="text-muted">İsim:</span>{' '}
                      <Link
                        href={`/users/${product.seller.id}`}
                        className="text-primary-600 hover:text-primary-700 font-medium"
                      >
                        {product.seller.displayName}
                      </Link>
                    </p>
                    <p>
                      <span className="text-muted">Email:</span> {product.seller.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Actions */}
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-heading mb-4">İşlemler</h3>
                  <div className="space-y-2">
                    {canApprove && (
                      <Button variant="success" size="md" onClick={() => setShowApproveModal(true)} className="w-full flex items-center justify-center gap-2">
                        <CheckCircleIcon className="w-5 h-5" />
                        Onayla
                      </Button>
                    )}
                    {canReject && (
                      <Button variant="danger" size="md" onClick={() => setShowRejectModal(true)} className="w-full flex items-center justify-center gap-2">
                        <XCircleIcon className="w-5 h-5" />
                        Reddet
                      </Button>
                    )}
                    {canRestore && (
                      <Button variant="success" size="md" onClick={handleRestore} disabled={processing} isLoading={processing} className="w-full flex items-center justify-center gap-2">
                        <ArrowUturnLeftIcon className="w-5 h-5" />
                        Geri Yükle
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="secondary" size="md" onClick={() => setShowDeleteModal(true)} className="w-full flex items-center justify-center gap-2">
                        <TrashIcon className="w-5 h-5" />
                        Kaldır
                      </Button>
                    )}
                  </div>
                </div>

                {/* Quick Links */}
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-heading mb-4">Hızlı Linkler</h3>
                  <div className="space-y-2">
                    <Link
                      href={`/users/${product.seller.id}`}
                      className="block w-full px-4 py-2 text-left text-body hover:bg-surface rounded-lg transition-colors"
                    >
                      Satıcıyı Görüntüle
                    </Link>
                    <Link
                      href={`/orders?productId=${product.id}`}
                      className="block w-full px-4 py-2 text-left text-body hover:bg-surface rounded-lg transition-colors"
                    >
                      Siparişleri Görüntüle
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'ai' ? (
            /* AI Denetim Tab */
            <ModerationEventsPanel
              entityType="product"
              entityId={productId}
              title="AI Denetim"
              description="Bu ürüne ait tüm AI moderasyon olayları"
            />
          ) : (
            /* Reviews Tab */
            <div className="bg-surface-elevated rounded-xl shadow-sm">
              <div className="p-6 border-b border-border">
                <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
                  <StarIcon className="w-5 h-5" />
                  Ürün Yorumları
                </h2>
              </div>

              {reviewsLoading ? (
                <div className="p-12 text-center">
                  <Spinner size="lg" className="mx-auto" />
                  <p className="mt-4 text-muted">Yorumlar yükleniyor...</p>
                </div>
              ) : reviews.length === 0 ? (
                <div className="p-12 text-center text-muted">
                  Bu ürün için henüz yorum yok.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {reviews.map((review) => (
                    <div key={review.id} className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold">
                            {review.user.displayName.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-heading">{review.user.displayName}</span>
                              {review.isVerifiedPurchase && (
                                <span className="text-xs text-success-600 flex items-center gap-1">
                                  <CheckCircleIcon className="w-3 h-3" /> Onaylı Alıcı
                                </span>
                              )}
                              {getReviewStatusBadge(review.status)}
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              {renderStars(review.score)}
                              <span className="text-sm text-muted">
                                {format(new Date(review.createdAt), 'dd MMM yyyy', { locale: tr })}
                              </span>
                            </div>
                            {review.title && <p className="font-medium text-heading mb-1">{review.title}</p>}
                            {review.review && <p className="text-muted">{review.review}</p>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {review.status !== 'approved' && (
                            <Button variant="secondary" onClick={() => handleReviewStatusUpdate(review.id, 'approved')}
                              className="p-2 text-success-600 hover:bg-success-50 rounded-lg"
                              title="Onayla">
                              <CheckCircleIcon className="w-5 h-5" />
                            </Button>
                          )}
                          {review.status !== 'rejected' && (
                            <Button variant="secondary" onClick={() => handleReviewStatusUpdate(review.id, 'rejected')}
                              className="p-2 text-danger-600 hover:bg-danger-50 rounded-lg"
                              title="Reddet">
                              <XCircleIcon className="w-5 h-5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Approve Modal */}
        {showApproveModal && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">Ürünü Onayla</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-body mb-2">
                  Not (Opsiyonel)
                </label>
                <Textarea value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  rows={3}
                  placeholder="Onay notu ekleyin..." />
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" size="md" onClick={() => { setShowApproveModal(false); setApproveNote(''); }} disabled={processing} className="flex-1">
                  İptal
                </Button>
                <Button variant="success" size="md" onClick={handleApprove} disabled={processing} isLoading={processing} className="flex-1">
                  {processing ? 'İşleniyor...' : 'Onayla'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">Ürünü Reddet</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-body mb-2">
                  Red Nedeni *
                </label>
                <Textarea value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={4}
                  placeholder="Red nedenini açıklayın..." />
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" size="md" onClick={() => { setShowRejectModal(false); setRejectReason(''); }} disabled={processing} className="flex-1">
                  İptal
                </Button>
                <Button variant="danger" size="md" onClick={handleReject} disabled={processing} isLoading={processing} className="flex-1">
                  {processing ? 'İşleniyor...' : 'Reddet'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">Ürünü Kaldır</h3>
              <p className="text-muted mb-6">
                Ürün listelerden kaldırılacak (Kaldırıldı durumuna alınır). İstediğinde Geri Yükle ile geri getirebilirsin.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" size="md" onClick={() => setShowDeleteModal(false)} disabled={processing} className="flex-1">
                  İptal
                </Button>
                <Button variant="danger" size="md" onClick={handleDelete} disabled={processing} isLoading={processing} className="flex-1">
                  {processing ? 'İşleniyor...' : 'Kaldır'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
