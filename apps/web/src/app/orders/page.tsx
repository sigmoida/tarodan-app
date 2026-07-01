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
import { StarIcon as StarOutlineIcon, TruckIcon, DocumentTextIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';
import { formatOrderStatus } from '@/lib/format';
import { Button, Input, Spinner, StatusBadge, Textarea, orderStatusConfig } from '@tarodan/ui';

interface Order {
  id: string;
  orderNumber: string;
  /** Çok ürünlü checkout grubu: aynı gruptaki siparişler tek kart altında gösterilir */
  checkoutGroupId?: string | null;
  status: string;
  /** 'iptal' (kargo öncesi) | 'iade' (kargo sonrası). status 'refunded' olsa bile
   *  'iptal' ise UI "İade" yerine "İptal Edildi" gösterir. */
  cancellationType?: string | null;
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
  /** Açık iade talebi varsa: yeni iade/iptal butonları gizlenir, durum gösterilir. */
  activeRefundRequest?: {
    id: string;
    status: string;
    refundNumber?: string;
  } | null;
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
  const [statusFilter, setStatusFilter] = useState<'active' | 'cancelled' | 'refunds'>('active');
  // Çok ürünlü checkout grupları accordion: varsayılan KAPALI, kullanıcı tek tek açar.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
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

  // Liste durum rozeti: (1) Açık iade varsa "İade Sürecinde" (sipariş 'delivered'
  // kalsa da iade akışı aktif). (2) Kargo öncesi iptalde status 'refunded' olabilir
  // ama cancellationType='iptal' → "İptal Edildi". (3) Aksi halde sipariş durumu.
  const displayStatusOf = (order: Order): { status: string; label: string } => {
    if (order.activeRefundRequest) {
      // İade tamamlandıysa "İade Edildi", aksi halde "İade Sürecinde" (mobil ile tutarlı).
      const done = order.activeRefundRequest.status === 'refunded';
      return {
        status: done ? 'refunded' : 'refund_requested',
        label: done
          ? locale === 'en'
            ? 'Refunded'
            : 'İade Edildi'
          : locale === 'en'
            ? 'Refund in progress'
            : 'İade Sürecinde',
      };
    }
    if (order.cancellationType === 'iptal') {
      return { status: 'cancelled', label: t('order.statusCancelled') };
    }
    return {
      status: order.status,
      label:
        localizedOrderStatusLabels[order.status] ||
        formatOrderStatus(order.status, locale),
    };
  };
  // İptal edilen siparişte kargo bilgisi gösterme.
  const isCancelledOrder = (order: Order) =>
    order.cancellationType === 'iptal' || order.status === 'cancelled';
  // Kargo/takip satırı SADECE gerçek gönderi varken: shipment + dolu trackingNumber +
  // sipariş durumu kargolanmış/teslim. Teslim öncesi (pending_payment/paid/preparing)
  // veya iptalde placeholder kargo bilgisi gösterilmez.
  const hasVisibleShipment = (order: Order) =>
    !!order.shipment &&
    !!order.shipment.trackingNumber &&
    !isCancelledOrder(order) &&
    ['shipped', 'delivered', 'awaiting_buyer_confirmation', 'completed'].includes(
      order.status,
    );

  const [sellerCommunication, setSellerCommunication] = useState(5);
  const [sellerShipping, setSellerShipping] = useState(5);
  const [sellerPackaging, setSellerPackaging] = useState(5);
  const [sellerReviewText, setSellerReviewText] = useState('');

  const [showShippingModal, setShowShippingModal] = useState(false);
  const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [submittingShipping, setSubmittingShipping] = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  // İptal nedeni modalı (kargo öncesi alıcı iptali).
  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');

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
          refundsOnly: statusFilter === 'refunds' ? true : undefined,
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
      // Yeni eLogo e-Arşiv ucu — siparişe ait gerçek fatura (yoksa null).
      const invoiceRes = await api.get(`/elogo/invoices/by-order/${orderId}`);
      const invoice = invoiceRes.data;
      if (!invoice?.id) {
        toast.error(locale === 'en' ? 'Invoice not ready yet' : 'Fatura henüz hazır değil');
        return;
      }
      const res = await api.get(`/elogo/invoices/${invoice.id}/pdf`);
      const url = res.data?.url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        toast.success(locale === 'en' ? 'Invoice opened' : 'Fatura açıldı');
      } else {
        toast.error(locale === 'en' ? 'Invoice not ready yet' : 'Fatura henüz hazır değil');
      }
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

  // Kargo öncesi = iptal, kargo sonrası = iade. shipment yoksa veya yalnızca
  // pending ise henüz kargolanmamış sayılır.
  const hasShipped = (order: Order) => {
    if (['shipped', 'delivered', 'completed'].includes(order.status)) return true;
    const s = order.shipment?.status;
    return !!s && s !== 'pending' && s !== 'cancelled' && s !== 'failed';
  };

  // Kargo öncesi alıcı iptali: iptal nedeni modalını aç (POST /orders/:id/cancel).
  const handleCancelOrder = (order: Order) => {
    setCancelReason('');
    setCancelModalOrder(order);
  };

  const submitCancelOrder = async () => {
    const order = cancelModalOrder;
    if (!order) return;
    setCancellingOrderId(order.id);
    try {
      await api.post(`/orders/${order.id}/cancel`, {
        reason: cancelReason.trim() || undefined,
      });
      toast.success(locale === 'en' ? 'Order cancelled' : 'Sipariş iptal edildi');
      setCancelModalOrder(null);
      setCancelReason('');
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['orders-counts'] });
    } catch (err: any) {
      toast.error(
        err.response?.data?.message ||
          (locale === 'en' ? 'Could not cancel order' : 'Sipariş iptal edilemedi'),
      );
    } finally {
      setCancellingOrderId(null);
    }
  };

  // Sipariş aksiyon butonları — TEK kaynak ve TEK stil (dolu buton). Tekli kart ile
  // grup içindeki her ürün kartı aynı butonları kullanır. Görünürlük modeli tek yerde:
  // gereksiz durumda buton render EDİLMEZ.
  const renderOrderActions = (order: Order) => {
    const shipped = hasShipped(order);
    const cancelled = isCancelledOrder(order);
    const isBuyer = order.isBuyer !== false;
    const isSeller = !!order.isSeller;
    const hasProduct = !!(order.product?.id || order.items?.[0]?.product?.id);
    // "Tekrar Sipariş Ver" yalnız BİTMİŞ siparişte (teslim/tamamlanmış/iptal/iade);
    // devam eden (ödendi/hazırlanıyor/kargoda) siparişte anlamsız → gizle.
    const isTerminal = ['delivered', 'completed', 'cancelled', 'refunded'].includes(order.status);
    const refundId = order.activeRefundRequest?.id;

    const show = {
      track: isBuyer && shipped && !cancelled,
      invoiceBuyer: isBuyer && ['paid', 'preparing', 'shipped', 'delivered', 'completed'].includes(order.status),
      reorder: isBuyer && hasProduct && isTerminal,
      refundLink: !!refundId,
      cancel: !refundId && isBuyer && ['paid', 'preparing'].includes(order.status) && !shipped,
      requestRefund: !refundId && isBuyer && shipped && !['cancelled', 'refunded'].includes(order.status),
      sellerShip: isSeller && ['paid', 'preparing'].includes(order.status) && !order.shipment,
      sellerInvoice: isSeller && ['paid', 'preparing', 'shipped'].includes(order.status),
      review: canReview(order),
    };

    const trackHref = `/track-order?orderNumber=${encodeURIComponent(order.orderNumber)}&email=${encodeURIComponent(user?.email || '')}`;
    const invoiceLabel = downloadingInvoiceOrderId === order.id
      ? (locale === 'en' ? 'Downloading...' : 'İndiriliyor...')
      : t('order.downloadInvoice');
    const cancelLabel = cancellingOrderId === order.id
      ? (locale === 'en' ? 'Cancelling...' : 'İptal ediliyor...')
      : (locale === 'en' ? 'Cancel' : 'İptal Et');

    return (
      <div className="flex flex-wrap gap-2 mt-4">
        <Link href={`/orders/${order.id}`} className="px-4 py-2 bg-surface-alt hover:bg-border-subtle text-body rounded-lg transition-colors text-sm">
          {t('common.details')}
        </Link>
        {show.track && (
          <Link href={trackHref} className="px-4 py-2 bg-info-600 hover:bg-info-700 text-inverted rounded-lg transition-colors text-sm">
            {t('order.trackOrder')}
          </Link>
        )}
        {show.invoiceBuyer && (
          <Button variant="secondary" size="sm" onClick={() => handleDownloadInvoice(order.id)} disabled={downloadingInvoiceOrderId === order.id}>
            {invoiceLabel}
          </Button>
        )}
        {show.reorder && (
          <Button variant="primary" size="sm" onClick={() => handleReorder(order)}>
            {t('order.reorder')}
          </Button>
        )}
        {show.refundLink ? (
          <Link href={`/refund-requests/${refundId}`} className="px-4 py-2 bg-info-50 text-info-700 border border-info-200 rounded-lg transition-colors text-sm hover:bg-info-100">
            {locale === 'en' ? 'View refund request' : 'İade Talebini Gör'}
          </Link>
        ) : (
          <>
            {show.cancel && (
              <Button variant="danger" size="sm" onClick={() => handleCancelOrder(order)} disabled={cancellingOrderId === order.id}>
                {cancelLabel}
              </Button>
            )}
            {show.requestRefund && (
              <Link href={`/orders/${order.id}`} className="px-4 py-2 bg-surface-alt hover:bg-border-subtle text-body rounded-lg transition-colors text-sm">
                {locale === 'en' ? 'Request Refund' : 'İade Talep Et'}
              </Link>
            )}
          </>
        )}
        {show.sellerShip && (
          <Button variant="primary" size="sm" className="flex items-center gap-1" onClick={() => openShippingModal(order.id)}>
            <TruckIcon className="w-4 h-4" />
            {locale === 'en' ? 'Add Shipping Info' : 'Kargo Bilgisi Ekle'}
          </Button>
        )}
        {show.sellerInvoice && (
          <Button variant="secondary" size="sm" className="flex items-center gap-1" onClick={() => handleDownloadInvoice(order.id)} disabled={downloadingInvoiceOrderId === order.id}>
            <DocumentTextIcon className="w-4 h-4" />
            {locale === 'en' ? 'Invoice' : 'Fatura'}
          </Button>
        )}
        {show.review && (
          <Button variant="primary" size="sm" className="flex items-center gap-1" onClick={() => openReviewModal(order)}>
            <StarIcon className="w-4 h-4" />
            {t('review.writeReview')}
          </Button>
        )}
      </div>
    );
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
            <Button variant="secondary" onClick={() => setStatusFilter('refunds')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${statusFilter === 'refunds'
                ? 'bg-heading text-inverted' : 'text-muted hover:bg-surface-alt'}`}>
              {locale === 'en' ? 'Refunds' : 'İadeler'}
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
              const renderOrderCard = (order: Order, compact = false) => (
                <div key={order.id} className={`bg-surface-elevated rounded-xl shadow-sm ${compact ? 'p-4' : 'p-6'}`}>
                  <div className={`flex justify-between items-start ${compact ? 'mb-3' : 'mb-4'}`}>
                    <div>
                      <p className="text-sm text-muted">
                        {t('order.orderNumber')} #{order.orderNumber}
                      </p>
                      <p className="text-sm text-subtle">
                        {new Date(order.createdAt).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                    <StatusBadge
                      status={displayStatusOf(order).status}
                      config={orderStatusConfig}
                      label={displayStatusOf(order).label}
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
                          <div className={`${compact ? 'w-12 h-12' : 'w-16 h-16'} bg-surface-alt rounded-lg overflow-hidden flex-shrink-0`}>
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

                  <div className={`flex justify-between items-center border-t border-border-subtle ${compact ? 'mt-3 pt-3' : 'mt-4 pt-4'}`}>
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

                  {hasVisibleShipment(order) && (
                    <div className="mt-4 p-3 bg-surface rounded-lg">
                      <p className="text-sm">
                        <span className="text-muted">{t('order.shippingCompany')}:</span>{' '}
                        {order.shipment!.carrier || order.shipment!.provider}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted">{t('order.trackingNumber')}:</span>{' '}
                        <span className="font-mono">{order.shipment!.trackingNumber}</span>
                      </p>
                    </div>
                  )}

                  {renderOrderActions(order)}
                </div>
              );

              if (entry.orders.length === 1) {
                return renderOrderCard(entry.orders[0]);
              }

              // Çok ürünlü sipariş: accordion. Kapalıyken özet (thumbnail dizisi +
              // "N ürünlük sepet" + toplam + chevron), tıklanınca satırlar açılır.
              const groupTotal = entry.orders.reduce(
                (sum, o) => sum + (Number(o.totalAmount) || Number(o.amount) || 0),
                0,
              );
              const groupDate = entry.orders[0]?.createdAt;
              const isExpanded = expandedGroups.has(entry.key);
              // İlk 4 ürünün thumbnail'i (üst üste binen avatarlar), fazlası "+N".
              const thumbOrders = entry.orders.slice(0, 4);
              const extraCount = entry.orders.length - thumbOrders.length;
              return (
                <div key={entry.key} className="space-y-4">
                  {/* Özet başlık: tekli sipariş kartıyla AYNI krom (rounded-xl shadow-sm p-6),
                      kapalıyken de tek sipariş kartına benzer durur; tıklayınca açılır. */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(entry.key)}
                    aria-expanded={isExpanded}
                    className="w-full block p-6 bg-surface-elevated rounded-xl shadow-sm hover:bg-surface-alt/30 transition-colors text-left"
                  >
                    {/* 1. Üst satır — tekli karttaki "Sipariş No / tarih + durum rozeti" hizası */}
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-sm text-muted">
                          {locale === 'en' ? 'Multi-item order' : 'Çoklu sipariş'}
                        </p>
                        <p className="text-sm text-subtle">
                          {groupDate ? new Date(groupDate).toLocaleDateString('tr-TR') : ''}
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 bg-info-50 text-info-700 text-xs font-medium">
                        {entry.orders.length} {locale === 'en' ? 'items' : 'ürün'}
                      </span>
                    </div>

                    {/* 2. Orta satır — tekli karttaki ürün görseli hizası (büyük thumbnaillar) */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center flex-shrink-0">
                        {thumbOrders.map((o, i) => {
                          const info = o.product || o.items?.[0]?.product;
                          const img = info?.imageUrl || o.items?.[0]?.product?.imageUrl;
                          return (
                            <div
                              key={o.id}
                              className={`w-16 h-16 rounded-lg bg-surface-alt overflow-hidden flex-shrink-0 ring-2 ring-surface-elevated ${i > 0 ? '-ml-4' : ''}`}
                              style={{ zIndex: thumbOrders.length - i }}
                            >
                              {img ? (
                                <img
                                  src={img}
                                  alt={info?.title || ''}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl">
                                  🚗
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {extraCount > 0 && (
                          <div className="w-16 h-16 rounded-lg bg-primary-50 text-primary-600 text-sm font-semibold flex items-center justify-center flex-shrink-0 ring-2 ring-surface-elevated -ml-4">
                            +{extraCount}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-heading">
                          {locale === 'en'
                            ? `Cart of ${entry.orders.length} items`
                            : `${entry.orders.length} ürünlük sepet`}
                        </p>
                        <p className="text-sm text-muted">
                          {locale === 'en'
                            ? 'Each item ships separately'
                            : 'Her ürün ayrı kargolanır'}
                        </p>
                      </div>
                    </div>

                    {/* 3. Alt satır — tekli karttaki "satıcı / toplam" hizası + aç-kapa */}
                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-border-subtle">
                      <span className="text-sm text-muted">
                        {isExpanded
                          ? (locale === 'en' ? 'Hide items' : 'Ürünleri gizle')
                          : (locale === 'en' ? 'View items' : 'Ürünleri gör')}
                      </span>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-muted">
                            {locale === 'en' ? 'Total' : 'Toplam'}
                          </p>
                          <p className="text-lg font-semibold text-primary-500">
                            {groupTotal.toLocaleString('tr-TR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            TL
                          </p>
                        </div>
                        {isExpanded ? (
                          <ChevronUpIcon className="w-5 h-5 text-muted flex-shrink-0" />
                        ) : (
                          <ChevronDownIcon className="w-5 h-5 text-muted flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  </button>
                  {/* Açılınca: grubun ürünleri girintili + sol-bantlı bir kolonda KOMPAKT
                      kartlar olarak görünür → hem küçük durur hem de sepete ait olduğu net belli olur. */}
                  {isExpanded && (
                    <div className="ml-3 space-y-3 border-l-2 border-primary-300 pl-4">
                      {entry.orders.map((order) => renderOrderCard(order, true))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* İptal Nedeni Modalı (kargo öncesi alıcı iptali) */}
        {cancelModalOrder && (
          <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4">
            <div className="bg-surface-elevated rounded-2xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold text-heading mb-1">
                {locale === 'en' ? 'Cancel Order' : 'Siparişi İptal Et'}
              </h2>
              <p className="text-sm text-muted mb-4">
                {locale === 'en'
                  ? 'Your payment will be refunded. You can optionally add a reason.'
                  : 'Ödemeniz iade edilecektir. İsterseniz bir neden ekleyebilirsiniz.'}
              </p>

              <div className="flex flex-wrap gap-2 mb-3">
                {(locale === 'en'
                  ? ['Changed my mind', 'Wrong item', 'Found cheaper', 'Too slow']
                  : ['Vazgeçtim', 'Yanlış ürün', 'Daha uygununu buldum', 'Teslimat uzun']
                ).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCancelReason(preset)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      cancelReason === preset
                        ? 'bg-primary-500 text-inverted border-primary-500'
                        : 'bg-surface text-body border-border hover:bg-surface-alt'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value.slice(0, 500))}
                placeholder={
                  locale === 'en'
                    ? 'Reason (optional, max 500 characters)'
                    : 'İptal nedeni (opsiyonel, en fazla 500 karakter)'
                }
                rows={3}
                maxLength={500}
                className="px-4"
              />
              <p className="text-xs text-subtle mt-1 text-right">
                {cancelReason.length}/500
              </p>

              <div className="flex gap-3 mt-4">
                <Button
                  variant="secondary"
                  size="md"
                  className="flex-1"
                  onClick={() => {
                    setCancelModalOrder(null);
                    setCancelReason('');
                  }}
                  disabled={!!cancellingOrderId}
                >
                  {locale === 'en' ? 'Keep Order' : 'Vazgeç'}
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  className="flex-1 flex items-center justify-center gap-2"
                  onClick={submitCancelOrder}
                  disabled={!!cancellingOrderId}
                >
                  {cancellingOrderId ? (
                    <Spinner
                      size="sm"
                      color="border-surface-elevated border-t-transparent"
                    />
                  ) : null}
                  {locale === 'en' ? 'Cancel Order' : 'Siparişi İptal Et'}
                </Button>
              </div>
            </div>
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
