'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { api, ratingsApi, mediaApi } from '@/lib/api';
import { StarIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon, TruckIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { formatOrderStatus } from '@/lib/format';
import { Button, Input, Spinner, StatusBadge, Textarea, orderStatusConfig } from '@tarodan/ui';

interface Order {
  id: string;
  orderNumber: string;
  /** Çok ürünlü checkout grubu: aynı gruptaki siparişler tek kart altında gösterilir */
  checkoutGroupId?: string | null;
  status: string;
  totalAmount?: number;
  amount?: number;
  createdAt: string;
  product?: {
    id: string;
    title: string;
    imageUrl?: string;
    status?: string;
  };
  items?: Array<{
    id: string;
    product: {
      id: string;
      title: string;
      imageUrl?: string;
    };
    quantity: number;
    price: number;
  }>;
  seller?: {
    id: string;
    displayName: string;
  };
  buyer?: {
    id: string;
    displayName: string;
  };
  shipment?: {
    trackingNumber: string;
    carrier?: string;
    provider?: string;
    status: string;
  };
  isBuyer?: boolean;
  isSeller?: boolean;
  hasProductRating?: boolean;
  hasSellerRating?: boolean;
  pricing?: {
    subtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    totalAmount: number;
    sellerNetAmount: number;
  };
  sellerFeeAmount?: number;
  sellerNetAmount?: number;
}

// Status labels will be handled with translation function inside component

// Statuses that allow reviews
// Only delivered and completed orders can be reviewed (must receive before rating)
const REVIEWABLE_STATUSES = ['completed', 'delivered'];

export default function OrdersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useTranslation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const addToCart = useCartStore((s) => s.addToCart);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [filter, setFilter] = useState<'all' | 'buyer' | 'seller'>('buyer');
  const [statusFilter, setStatusFilter] = useState<'active' | 'cancelled'>('active');
  const [downloadingInvoiceOrderId, setDownloadingInvoiceOrderId] = useState<string | null>(null);

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewingOrder, setReviewingOrder] = useState<Order | null>(null);
  const [reviewScore, setReviewScore] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewImages, setReviewImages] = useState<File[]>([]);
  const [reviewImagePreviews, setReviewImagePreviews] = useState<string[]>([]);

  const localizedOrderStatusLabels: Record<string, string> = {
    pending_payment: t('order.statusPending'),
    paid: t('order.statusPaid'),
    preparing: t('order.statusProcessing'),
    shipped: t('order.statusShipped'),
    delivered: t('order.statusDelivered'),
    completed: t('order.statusCompleted'),
    cancelled: t('order.statusCancelled'),
    refund_requested: t('order.refundStarted'),
    refunded: t('order.statusRefunded'),
  };

  const [sellerCommunication, setSellerCommunication] = useState(5);
  const [sellerShipping, setSellerShipping] = useState(5);
  const [sellerPackaging, setSellerPackaging] = useState(5);
  const [sellerReviewText, setSellerReviewText] = useState('');

  const [showShippingModal, setShowShippingModal] = useState(false);
  const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [submittingShipping, setSubmittingShipping] = useState(false);

  useEffect(() => {
    if (!mounted || authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/orders');
    }
  }, [mounted, isAuthenticated, authLoading, router]);

  const ordersQuery = useQuery({
    queryKey: ['orders', filter, statusFilter],
    queryFn: async (): Promise<Order[]> => {
      const response = await api.get('/orders', {
        params: {
          role: filter === 'all' ? undefined : filter,
          status: statusFilter === 'cancelled' ? 'cancelled' : undefined,
        },
      });
      return response.data.orders || response.data.data || [];
    },
    enabled: !authLoading && isAuthenticated,
    meta: { page: 'orders' },
  });
  const orders = ordersQuery.data ?? [];
  const loading = ordersQuery.isLoading;

  // Alış / satış sipariş adetleri (aktif siparişler). Filtre butonlarında ve
  // toplam kırılımında gösterilir. limit:1 ile sadece meta.total çekilir.
  const orderCountsQuery = useQuery({
    queryKey: ['orders-counts'],
    queryFn: async (): Promise<{ buyer: number; seller: number }> => {
      const [buyerRes, sellerRes] = await Promise.all([
        api.get('/orders', { params: { role: 'buyer', limit: 1 } }),
        api.get('/orders', { params: { role: 'seller', limit: 1 } }),
      ]);
      return {
        buyer: buyerRes.data?.meta?.total ?? 0,
        seller: sellerRes.data?.meta?.total ?? 0,
      };
    },
    enabled: !authLoading && isAuthenticated,
  });
  const orderCounts = orderCountsQuery.data ?? { buyer: 0, seller: 0 };

  // Alıcı siparişlerini checkout grubuna göre topla: aynı checkout'ta alınan
  // ürünler tek kart altında alt satırlar olarak görünür (her birinin kargosu ayrı).
  // Satıcı görünümündeki siparişler gruplanmaz.
  const groupedOrderEntries: Array<{ key: string; orders: Order[] }> = (() => {
    const entries: Array<{ key: string; orders: Order[] }> = [];
    const indexByGroup = new Map<string, number>();
    for (const order of orders) {
      const gid = order.checkoutGroupId;
      if (gid && (order as any).isSeller !== true) {
        const idx = indexByGroup.get(gid);
        if (idx != null) {
          entries[idx].orders.push(order);
          continue;
        }
        indexByGroup.set(gid, entries.length);
        entries.push({ key: gid, orders: [order] });
      } else {
        entries.push({ key: order.id, orders: [order] });
      }
    }
    return entries;
  })();

  const openReviewModal = (order: Order) => {
    setReviewingOrder(order);
    setReviewScore(5);
    setReviewTitle('');
    setReviewText('');
    setSellerCommunication(5);
    setSellerShipping(5);
    setSellerPackaging(5);
    setSellerReviewText('');
    setReviewImages([]);
    setReviewImagePreviews([]);
    setShowReviewModal(true);
  };

  const handleReviewImageAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const maxFiles = 5;
    const remaining = maxFiles - reviewImages.length;
    const newFiles = files.slice(0, remaining);
    if (newFiles.length === 0) return;
    setReviewImages(prev => [...prev, ...newFiles]);
    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setReviewImagePreviews(prev => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };
  const removeReviewImage = (index: number) => {
    setReviewImages(prev => prev.filter((_, i) => i !== index));
    setReviewImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const submitReview = async () => {
    const productId = reviewingOrder?.product?.id || reviewingOrder?.items?.[0]?.product?.id;
    const sellerId = reviewingOrder?.seller?.id;

    if (!reviewingOrder || !productId) {
      toast.error(t('order.orderNotFound'));
      return;
    }

    setSubmittingReview(true);
    try {
      // Upload review images first
      let imageUrls: string[] = [];
      if (reviewImages.length > 0) {
        const uploadPromises = reviewImages.map(file => mediaApi.uploadReviewImage(file));
        const results = await Promise.all(uploadPromises);
        imageUrls = results.map(r => r.data?.url).filter(Boolean) as string[];
      }
      // Submit product rating
      await ratingsApi.createProductRating({
        productId,
        orderId: reviewingOrder.id,
        score: reviewScore,
        title: reviewTitle || undefined,
        review: reviewText || undefined,
        images: imageUrls.length > 0 ? imageUrls : undefined,
      });

      // Submit seller rating (if seller exists)
      if (sellerId) {
        const avgSellerScore = Math.round((sellerCommunication + sellerShipping + sellerPackaging) / 3);
        const scoreBreakdown = `İletişim: ${sellerCommunication}/5, Kargo: ${sellerShipping}/5, Paketleme: ${sellerPackaging}/5`;
        const fullComment = sellerReviewText
          ? `${sellerReviewText}\n\n${scoreBreakdown}`
          : scoreBreakdown;
        await ratingsApi.createUserRating({
          receiverId: sellerId,
          orderId: reviewingOrder.id,
          score: avgSellerScore,
          comment: fullComment,
        });
      }

      toast.success(t('review.reviewSubmitted'));
      setShowReviewModal(false);
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Review submit error:', error);
      toast.error(error.response?.data?.message || t('common.operationFailed'));
    } finally {
      setSubmittingReview(false);
    }
  };

  const canReview = (order: Order) => {
    // Only buyers can review and status must be reviewable
    const productId = order.product?.id || order.items?.[0]?.product?.id;
    const isBuyer = productId && (order.isBuyer !== false) && filter !== 'seller';
    const isReviewableStatus = REVIEWABLE_STATUSES.includes(order.status);
    const notAlreadyReviewed = order.hasProductRating !== true || order.hasSellerRating !== true;
    return isBuyer && isReviewableStatus && notAlreadyReviewed;
  };

  const handleDownloadInvoice = async (orderId: string) => {
    setDownloadingInvoiceOrderId(orderId);
    try {
      const invoiceRes = await api.get(`/invoices/order/${orderId}`);
      const invoice = invoiceRes.data;
      if (!invoice?.id) {
        toast.error(locale === 'en' ? 'Invoice not found' : 'Fatura bulunamadı');
        return;
      }
      const response = await api.get(`/invoices/download/${invoice.id}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fatura-${invoice.invoiceNumber || invoice.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(locale === 'en' ? 'Invoice downloaded' : 'Fatura indirildi');
    } catch (err: any) {
      if (err.response?.status === 404) {
        toast.error(locale === 'en' ? 'Invoice not ready yet' : 'Fatura henüz hazır değil');
      } else {
        toast.error(err.response?.data?.message || (locale === 'en' ? 'Download failed' : 'İndirme başarısız'));
      }
    } finally {
      setDownloadingInvoiceOrderId(null);
    }
  };

  const openShippingModal = (orderId: string) => {
    setShippingOrderId(orderId);
    setTrackingNumber('');
    setShowShippingModal(true);
  };

  const submitShipping = async () => {
    if (!shippingOrderId || !trackingNumber.trim()) {
      toast.error(locale === 'en' ? 'Please enter tracking number' : 'Lütfen takip numarasını girin');
      return;
    }
    setSubmittingShipping(true);
    try {
      await api.post(`/orders/${shippingOrderId}/ship`, {
        trackingNumber: trackingNumber.trim(),
        carrier: 'Sürat Kargo',
      });
      toast.success(locale === 'en' ? 'Shipping info saved!' : 'Kargo bilgileri kaydedildi!');
      setShowShippingModal(false);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || (locale === 'en' ? 'Could not save shipping info' : 'Kargo bilgileri kaydedilemedi'));
    } finally {
      setSubmittingShipping(false);
    }
  };

  const handleReorder = async (order: Order) => {
    const productId = order.product?.id || order.items?.[0]?.product?.id;
    if (!productId) {
      toast.error(t('order.orderNotFound'));
      return;
    }
    try {
      await addToCart(productId, order.items?.[0]?.quantity ?? 1);
      toast.success(locale === 'en' ? 'Added to cart' : 'Sepete eklendi');
      router.push('/cart');
    } catch (err: any) {
      toast.error(err?.message || (locale === 'en' ? 'Could not add to cart' : 'Sepete eklenemedi'));
    }
  };

  if (!mounted || authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-surface text-heading flex flex-col">
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="animate-pulse text-muted text-sm">
            {locale === 'en' ? 'Loading...' : 'Yükleniyor...'}
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <h1 className="text-3xl font-bold text-heading">{t('order.myOrders')}</h1>
          <div className="flex flex-wrap gap-2 items-center">
            {(['buyer', 'seller', 'all'] as const).map((f) => (
              <Button variant="secondary" key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg transition-colors ${filter === f
                    ? 'bg-primary-500 text-inverted'
                    : 'bg-surface-elevated text-muted hover:bg-surface-alt border border-border'
                  }`}>
                {f === 'buyer'
                  ? `${t('profile.totalPurchases')} (${orderCounts.buyer})`
                  : f === 'seller'
                    ? `${t('profile.totalSales')} (${orderCounts.seller})`
                    : `${t('common.all')} (${orderCounts.buyer + orderCounts.seller})`}
              </Button>
            ))}
            <span className="text-subtle mx-1">|</span>
            <Button variant="secondary" onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${statusFilter === 'active'
                ? 'bg-heading text-inverted' : 'text-muted hover:bg-surface-alt'}`}>
              {locale === 'en' ? 'Active' : 'Aktif'}
            </Button>
            <Button variant="secondary" onClick={() => setStatusFilter('cancelled')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${statusFilter === 'cancelled'
                ? 'bg-heading text-inverted' : 'text-muted hover:bg-surface-alt'}`}>
              {locale === 'en' ? 'Cancelled' : 'İptal edilenler'}
            </Button>
          </div>
        </div>

        {(!mounted || authLoading || !isAuthenticated || loading) ? (
          <div className="flex justify-center py-12">
            <Spinner size="xl" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-surface-elevated rounded-xl">
            <p className="text-muted">{t('order.noOrders')}</p>
            <Link
              href="/listings"
              className="inline-block mt-4 px-6 py-2 bg-primary-500 hover:bg-primary-600 text-inverted rounded-lg transition-colors"
            >
              {t('cart.browseListings')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedOrderEntries.map((entry) => {
              const renderOrderCard = (order: Order) => (
                <div key={order.id} className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm text-muted">
                        {t('order.orderNumber')} #{order.orderNumber}
                      </p>
                      <p className="text-sm text-subtle">
                        {new Date(order.createdAt).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                    <StatusBadge
                      status={order.status}
                      config={orderStatusConfig}
                      label={localizedOrderStatusLabels[order.status] || formatOrderStatus(order.status, locale)}
                    />
                  </div>

                  <div className="space-y-3">
                    {/* Ürün bilgisi - items veya product'tan al */}
                    {(() => {
                      const productInfo = order.product || order.items?.[0]?.product;
                      const productImage = productInfo?.imageUrl || order.items?.[0]?.product?.imageUrl;
                      const orderPrice = Number(order.totalAmount) || Number(order.amount) || order.items?.[0]?.price || 0;

                      return productInfo ? (
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-surface-alt rounded-lg overflow-hidden flex-shrink-0">
                            {productImage ? (
                              <img
                                src={productImage}
                                alt={productInfo.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-2xl">
                                🚗
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <Link
                              href={`/listings/${productInfo.id}`}
                              className="font-medium text-heading hover:text-primary-500 transition-colors"
                            >
                              {productInfo.title || (locale === 'en' ? 'Product' : 'Ürün')}
                            </Link>
                            <p className="text-sm text-muted">
                              1 {locale === 'en' ? 'x' : 'adet ×'} {orderPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted">{locale === 'en' ? 'Product info could not be loaded' : 'Ürün bilgisi yüklenemedi'}</p>
                      );
                    })()}
                  </div>

                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-border-subtle">
                    <div className="text-sm text-muted">
                      {order.isSeller ? (
                        <>{locale === 'en' ? 'Buyer' : 'Alıcı'}: {order.buyer?.displayName || '-'}</>
                      ) : (
                        <>{t('product.seller')}: {order.seller?.displayName || t('product.seller')}</>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-primary-500">
                        {(Number(order.totalAmount) || Number(order.amount) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                      </p>
                      {order.isSeller && (order.pricing?.sellerNetAmount != null || (order as any).sellerNetAmount != null) && (
                        <p className="text-sm text-success-600 mt-0.5">
                          {locale === 'en' ? 'Net to you' : 'Net kazanç'}: ₺{(Number(order.pricing?.sellerNetAmount ?? (order as any).sellerNetAmount ?? 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </div>

                  {order.shipment && (
                    <div className="mt-4 p-3 bg-surface rounded-lg">
                      <p className="text-sm">
                        <span className="text-muted">{t('order.shippingCompany')}:</span>{' '}
                        {order.shipment.carrier || order.shipment.provider}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted">{t('order.trackingNumber')}:</span>{' '}
                        <span className="font-mono">{order.shipment.trackingNumber}</span>
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mt-4">
                    <Link
                      href={`/orders/${order.id}`}
                      className="px-4 py-2 bg-surface-alt hover:bg-border-subtle text-body rounded-lg transition-colors text-sm"
                    >
                      {t('common.details')}
                    </Link>
                    {order.isBuyer !== false && (order.shipment || ['paid', 'preparing', 'shipped', 'delivered', 'completed'].includes(order.status)) && (
                      <Link
                        href={`/track-order?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(user?.email || '')}`}
                        className="px-4 py-2 bg-info-600 hover:bg-info-700 text-inverted rounded-lg transition-colors text-sm"
                      >
                        {t('order.trackOrder')}
                      </Link>
                    )}
                    {order.isBuyer !== false && ['paid', 'preparing', 'shipped', 'delivered', 'completed'].includes(order.status) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDownloadInvoice(order.id)}
                        disabled={downloadingInvoiceOrderId === order.id}
                      >
                        {downloadingInvoiceOrderId === order.id ? (locale === 'en' ? 'Downloading...' : 'İndiriliyor...') : t('order.downloadInvoice')}
                      </Button>
                    )}
                    {order.isBuyer !== false && (order.product?.id || order.items?.[0]?.product?.id) && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleReorder(order)}
                      >
                        {t('order.reorder')}
                      </Button>
                    )}
                    {/* Seller shipping actions */}
                    {order.isSeller && ['paid', 'preparing'].includes(order.status) && !order.shipment && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex items-center gap-1"
                        onClick={() => openShippingModal(order.id)}
                      >
                        <TruckIcon className="w-4 h-4" />
                        {locale === 'en' ? 'Add Shipping Info' : 'Kargo Bilgisi Ekle'}
                      </Button>
                    )}
                    {order.isSeller && ['paid', 'preparing', 'shipped'].includes(order.status) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex items-center gap-1"
                        onClick={() => handleDownloadInvoice(order.id)}
                        disabled={downloadingInvoiceOrderId === order.id}
                      >
                        <DocumentTextIcon className="w-4 h-4" />
                        {locale === 'en' ? 'Invoice' : 'Fatura'}
                      </Button>
                    )}
                    {canReview(order) && (
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex items-center gap-1"
                        onClick={() => openReviewModal(order)}
                      >
                        <StarIcon className="w-4 h-4" />
                        {t('review.writeReview')}
                      </Button>
                    )}
                  </div>
                </div>
              );

              if (entry.orders.length === 1) {
                return renderOrderCard(entry.orders[0]);
              }

              // Çok ürünlü sipariş grubu: tek kart altında alt siparişler
              const groupTotal = entry.orders.reduce(
                (sum, o) => sum + (Number(o.totalAmount) || Number(o.amount) || 0),
                0,
              );
              return (
                <div
                  key={entry.key}
                  className="rounded-2xl border border-border-subtle bg-surface p-3"
                >
                  <div className="flex flex-wrap justify-between items-center gap-2 px-3 py-2">
                    <p className="text-sm font-semibold text-heading">
                      {locale === 'en'
                        ? `Multi-item order · ${entry.orders.length} items`
                        : `Çok ürünlü sipariş · ${entry.orders.length} ürün`}
                    </p>
                    <p className="text-sm text-muted">
                      {locale === 'en'
                        ? 'Each item ships separately'
                        : 'Her ürün ayrı kargoyla gönderilir'}
                      {' · '}
                      <span className="font-semibold text-primary-500">
                        {groupTotal.toLocaleString('tr-TR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        TL
                      </span>
                    </p>
                  </div>
                  <div className="space-y-4">{entry.orders.map(renderOrderCard)}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* Review Modal */}
        {showReviewModal && reviewingOrder && (
          <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-surface-elevated rounded-2xl max-w-lg w-full p-6 my-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
              <h2 className="text-xl font-bold text-heading mb-4">{t('review.reviewOrder')}</h2>

              {/* Product Section */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
                  📦 {t('review.productReview')}
                </h3>

                {(reviewingOrder.product || reviewingOrder.items?.[0]?.product) && (
                  <div className="flex items-center gap-3 mb-4 p-3 bg-surface rounded-lg">
                    <div className="w-12 h-12 bg-border-subtle rounded flex items-center justify-center text-2xl overflow-hidden">
                      {(reviewingOrder.product?.imageUrl || reviewingOrder.items?.[0]?.product?.imageUrl) ? (
                        <img
                          src={reviewingOrder.product?.imageUrl || reviewingOrder.items?.[0]?.product?.imageUrl}
                          alt={locale === 'en' ? 'Product' : 'Ürün'}
                          className="w-full h-full object-cover"
                        />
                      ) : '🚗'}
                    </div>
                    <p className="font-medium text-heading">
                      {reviewingOrder.product?.title || reviewingOrder.items?.[0]?.product?.title}
                    </p>
                  </div>
                )}

                {/* Product Star Rating */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-body mb-2">{t('review.productScore')}</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Button variant="secondary" key={star}
                        type="button"
                        onClick={() => setReviewScore(star)}
                        className="p-1 hover:scale-110 transition-transform">
                        {star <= reviewScore ? (
                          <StarIcon className="w-8 h-8 text-warning-400" />
                        ) : (
                          <StarOutlineIcon className="w-8 h-8 text-border-strong" />
                        )}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-body mb-1">
                    {t('review.titleOptional')}
                  </label>
                  <Input type="text"
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    placeholder={locale === 'en' ? 'E.g.: Great product!' : 'Örn: Harika bir ürün!'}
                    className="px-4"
                    maxLength={100} />
                </div>

                {/* Review Text */}
                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    {t('review.commentOptional')}
                  </label>
                  <Textarea value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder={locale === 'en' ? 'Share your experience about the product...' : 'Ürün hakkında deneyiminizi paylaşın...'}
                    rows={3}
                    className="px-4"
                    maxLength={1000} />
                </div>

                {/* Photo Upload */}
                <div className="mt-3">
                  <label className="block text-sm font-medium text-body mb-1">
                    {locale === 'en' ? 'Photos (optional, max 5)' : 'Fotoğraflar (opsiyonel, maks 5)'}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {reviewImagePreviews.map((src, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <Button variant="secondary" type="button"
                          onClick={() => removeReviewImage(idx)}
                          className="absolute top-0 right-0 bg-danger-500 text-inverted rounded-bl-lg w-5 h-5 flex items-center justify-center text-xs">
                          ×
                        </Button>
                      </div>
                    ))}
                    {reviewImages.length < 5 && (
                      <label className="w-16 h-16 border-2 border-dashed items-center justify-center cursor-pointer hover:border-primary-400">
                        <span className="text-2xl text-subtle">+</span>
                        <Input type="file"
                          accept="image/*"
                          onChange={handleReviewImageAdd}
                          className="hidden" />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-border my-6"></div>

              {/* Seller Section */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
                  👤 {t('review.sellerReview')}
                </h3>

                {reviewingOrder.seller && (
                  <p className="text-sm text-muted mb-4">
                    {t('product.seller')}: <span className="font-medium text-heading">{reviewingOrder.seller.displayName}</span>
                  </p>
                )}

                {/* Seller Rating Categories */}
                <div className="space-y-3">
                  {/* Communication */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-body">{t('review.communication')}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Button variant="secondary" key={star}
                          type="button"
                          onClick={() => setSellerCommunication(star)}
                          className="p-0.5 hover:scale-110 transition-transform">
                          {star <= sellerCommunication ? (
                            <StarIcon className="w-5 h-5 text-warning-400" />
                          ) : (
                            <StarOutlineIcon className="w-5 h-5 text-border-strong" />
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Shipping Speed */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-body">{t('review.shippingSpeed')}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Button variant="secondary" key={star}
                          type="button"
                          onClick={() => setSellerShipping(star)}
                          className="p-0.5 hover:scale-110 transition-transform">
                          {star <= sellerShipping ? (
                            <StarIcon className="w-5 h-5 text-warning-400" />
                          ) : (
                            <StarOutlineIcon className="w-5 h-5 text-border-strong" />
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Packaging */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-body">{t('review.packaging')}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Button variant="secondary" key={star}
                          type="button"
                          onClick={() => setSellerPackaging(star)}
                          className="p-0.5 hover:scale-110 transition-transform">
                          {star <= sellerPackaging ? (
                            <StarIcon className="w-5 h-5 text-warning-400" />
                          ) : (
                            <StarOutlineIcon className="w-5 h-5 text-border-strong" />
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Seller Review Text */}
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-body mb-1">
                      {t('review.sellerComment')}
                    </label>
                    <Textarea value={sellerReviewText}
                      onChange={(e) => setSellerReviewText(e.target.value)}
                      placeholder={t('review.sellerCommentPlaceholder')}
                      className="border-border resize-none"
                      rows={3} />
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setShowReviewModal(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  className="flex-1"
                  onClick={submitReview}
                  disabled={submittingReview}
                >
                  {submittingReview ? t('common.sending') : t('review.submit')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Shipping Modal */}
        {showShippingModal && (
          <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-elevated rounded-2xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold text-heading mb-4 flex items-center gap-2">
                <TruckIcon className="w-6 h-6 text-primary-500" />
                {locale === 'en' ? 'Add Shipping Info' : 'Kargo Bilgisi Ekle'}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    {locale === 'en' ? 'Shipping Company' : 'Kargo Firması'}
                  </label>
                  <div className="px-3 py-2 rounded-lg bg-surface-muted text-body font-medium">
                    Sürat Kargo
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    {locale === 'en' ? 'Tracking Number' : 'Takip Numarası'} *
                  </label>
                  <Input type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder={locale === 'en' ? 'Enter tracking number' : 'Kargo takip numarasını girin'}
                    className="border-border font-mono" />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => setShowShippingModal(false)}
                >
                  {locale === 'en' ? 'Cancel' : 'İptal'}
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  className="flex-1 flex items-center justify-center gap-2"
                  onClick={submitShipping}
                  disabled={submittingShipping || !trackingNumber.trim()}
                >
                  <TruckIcon className="w-4 h-4" />
                  {submittingShipping
                    ? (locale === 'en' ? 'Saving...' : 'Kaydediliyor...')
                    : (locale === 'en' ? 'Save & Ship' : 'Kaydet ve Gönder')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
