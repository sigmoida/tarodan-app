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
  PhotoIcon,
  PencilIcon,
  StarIcon,
  ChatBubbleLeftRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { adminApi } from '@/lib/api';
import { AdminTabs } from '@/components/AdminTabs';
import { Button, Input, Select, Spinner, Textarea, productConditionConfig, enumLabel } from '@tarodan/ui';
import { getProductEffectivePrice, isProductOnSaleDisplay, getProductOriginalPriceForDisplay } from '@/lib/productPrice';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useConfirm } from '@/components/ConfirmProvider';

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
}

interface Review {
  id: string;
  score: number;
  title?: string;
  review?: string;
  status: 'pending' | 'approved' | 'rejected' | 'spam';
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
  const [showEditModal, setShowEditModal] = useState(false);

  // Tab and Reviews state
  const [activeTab, setActiveTab] = useState<'info' | 'reviews'>('info');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [replyText, setReplyText] = useState('');

  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    price: '',
    originalPrice: '',
    quantity: '',
    condition: '',
    status: '',
  });

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
      setEditForm({
        title: response.data.title,
        description: response.data.description || '',
        price: response.data.price?.toString() || '',
        originalPrice: response.data.originalPrice?.toString() || '',
        quantity: response.data.quantity?.toString() || '1',
        condition: response.data.condition,
        status: response.data.status,
      });
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

  useEffect(() => {
    if (activeTab === 'reviews' && productId) {
      loadReviews();
    }
  }, [activeTab, productId]);

  const handleReviewStatusUpdate = async (reviewId: string, status: string) => {
    try {
      await adminApi.updateReviewStatus(reviewId, status);
      toast.success(`Yorum durumu güncellendi`);
      loadReviews();
    } catch (error: any) {
      toast.error('Güncelleme başarısız');
    }
  };

  const handleReviewReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReview) return;
    try {
      await adminApi.replyToReview(selectedReview.id, replyText);
      toast.success('Yanıt gönderildi');
      setReplyModalOpen(false);
      setReplyText('');
      setSelectedReview(null);
      loadReviews();
    } catch (error: any) {
      toast.error('Yanıt gönderilemedi');
    }
  };

  const handleReviewDelete = async (reviewId: string) => {
    if (!(await confirm({ description: 'Bu yorumu silmek istediğinizden emin misiniz?', destructive: true }))) return;
    try {
      await adminApi.deleteReview(reviewId);
      toast.success('Yorum silindi');
      loadReviews();
    } catch (error: any) {
      toast.error('Silme başarısız');
    }
  };

  const openReplyModal = (review: Review) => {
    setSelectedReview(review);
    setReplyText(review.adminReply || '');
    setReplyModalOpen(true);
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
      case 'spam': return <span className="px-2 py-1 text-xs bg-surface-alt text-body rounded-full">Spam</span>;
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
      toast.success('Ürün silindi');
      router.push('/products');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Silme işlemi başarısız');
      setProcessing(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    try {
      const data = {
        ...editForm,
        price: parseFloat(editForm.price),
        originalPrice: editForm.originalPrice ? parseFloat(editForm.originalPrice) : null,
        quantity: editForm.quantity ? parseInt(editForm.quantity) : null,
      };

      await adminApi.updateProduct(productId, data);
      toast.success('Ürün güncellendi');
      setShowEditModal(false);
      loadProduct();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Güncelleme başarısız');
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
  const canDelete = product.status !== 'sold' && product.status !== 'reserved';

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
                { key: 'reviews', label: 'Yorumlar', icon: StarIcon, badge: reviews.length },
              ]}
              value={activeTab}
              onChange={(k) => setActiveTab(k as 'info' | 'reviews')}
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
                    <Button variant="primary" size="md" onClick={() => setShowEditModal(true)} className="w-full flex items-center justify-center gap-2">
                      <PencilIcon className="w-5 h-5" />
                      Düzenle
                    </Button>
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
                    {canDelete && (
                      <Button variant="secondary" size="md" onClick={() => setShowDeleteModal(true)} className="w-full flex items-center justify-center gap-2">
                        <TrashIcon className="w-5 h-5" />
                        Sil
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

                            {review.adminReply && (
                              <div className="mt-3 pl-4 border-l-2 border-primary-500 bg-primary-50 p-3 rounded-r-lg">
                                <p className="text-xs font-medium text-primary-700 mb-1">Satıcı Yanıtı:</p>
                                <p className="text-sm text-body">{review.adminReply}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {review.status === 'pending' && (
                            <>
                              <Button variant="secondary" onClick={() => handleReviewStatusUpdate(review.id, 'approved')}
                                className="p-2 text-success-600 hover:bg-success-50 rounded-lg"
                                title="Onayla">
                                <CheckCircleIcon className="w-5 h-5" />
                              </Button>
                              <Button variant="secondary" onClick={() => handleReviewStatusUpdate(review.id, 'rejected')}
                                className="p-2 text-danger-600 hover:bg-danger-50 rounded-lg"
                                title="Reddet">
                                <XCircleIcon className="w-5 h-5" />
                              </Button>
                            </>
                          )}
                          <Button variant="secondary" onClick={() => openReplyModal(review)}
                            className="p-2 text-info-600 hover:bg-info-50 rounded-lg"
                            title="Yanıtla">
                            <ChatBubbleLeftRightIcon className="w-5 h-5" />
                          </Button>
                          <Button variant="secondary" onClick={() => handleReviewStatusUpdate(review.id, 'spam')}
                            className="p-2 text-warning-600 hover:bg-warning-50 rounded-lg"
                            title="Spam">
                            <ExclamationTriangleIcon className="w-5 h-5" />
                          </Button>
                          <Button variant="secondary" onClick={() => handleReviewDelete(review.id)}
                            className="p-2 text-muted hover:text-danger-600 hover:bg-danger-50 rounded-lg"
                            title="Sil">
                            <TrashIcon className="w-5 h-5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Reply Modal */}
        {replyModalOpen && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-lg w-full mx-4">
              <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">Yorumu Yanıtla</h3>
              {selectedReview && (
                <div className="mb-4 p-3 bg-surface rounded-lg">
                  <p className="text-sm text-muted italic">"{selectedReview.review}"</p>
                </div>
              )}
              <form onSubmit={handleReviewReply}>
                <Textarea value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="text-heading"
                  rows={4}
                  placeholder="Yanıtınızı yazın..."
                  required />
                <div className="flex gap-3 mt-4">
                  <Button variant="secondary" size="md" type="button" onClick={() => setReplyModalOpen(false)} className="flex-1">
                    İptal
                  </Button>
                  <Button variant="primary" size="md" type="submit" className="flex-1">
                    Yanıtla
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

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

        {/* Edit Modal */}
        {showEditModal && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto py-10">
            <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-2xl w-full mx-4 my-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold text-heading leading-tight">Ürünü Düzenle</h3>
                <Button variant="secondary" onClick={() => setShowEditModal(false)}
                  className="text-muted hover:text-body">
                  <XCircleIcon className="w-6 h-6" />
                </Button>
              </div>

              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-body mb-1">Başlık</label>
                  <Input type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="text-heading"
                    required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-body mb-1">Açıklama</label>
                  <Textarea value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="text-heading"
                    rows={5} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Fiyat (₺)</label>
                    <Input type="number"
                      step="0.01"
                      value={editForm.price}
                      onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      className="text-heading"
                      required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">İndirimsiz Fiyat (Opsiyonel)</label>
                    <Input type="number"
                      step="0.01"
                      value={editForm.originalPrice}
                      onChange={(e) => setEditForm({ ...editForm, originalPrice: e.target.value })}
                      className="text-heading"
                      placeholder="Boş bırakılabilir" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Stok</label>
                    <Input type="number"
                      value={editForm.quantity}
                      onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                      className="text-heading" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Durum (Kondisyon)</label>
                    <Select
                      value={editForm.condition}
                      onChange={(e) => setEditForm({ ...editForm, condition: e.target.value })}
                    >
                      {Object.entries(productConditionConfig).map(([value, cfg]) => (
                        <option key={value} value={value}>
                          {cfg.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-body mb-1">Statü</label>
                    <Select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      {Object.entries(statusConfig).map(([key, config]) => (
                        <option key={key} value={key}>{config.label}</option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t mt-4">
                  <Button variant="secondary" size="md" type="button" onClick={() => setShowEditModal(false)} className="flex-1">
                    İptal
                  </Button>
                  <Button variant="primary" size="md" type="submit" disabled={processing} isLoading={processing} className="flex-1">
                    {processing ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">Ürünü Sil</h3>
              <p className="text-muted mb-6">
                Bu ürünü silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" size="md" onClick={() => setShowDeleteModal(false)} disabled={processing} className="flex-1">
                  İptal
                </Button>
                <Button variant="danger" size="md" onClick={handleDelete} disabled={processing} isLoading={processing} className="flex-1">
                  {processing ? 'İşleniyor...' : 'Sil'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
