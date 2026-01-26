'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { api, ratingsApi } from '@/lib/api';
import { StarIcon } from '@heroicons/react/24/solid';
import { StarIcon as StarOutlineIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n';

interface Order {
  id: string;
  orderNumber: string;
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
}

// Status labels will be handled with translation function inside component

// Statuses that allow reviews
const REVIEWABLE_STATUSES = ['completed', 'paid', 'delivered'];

export default function OrdersPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { isAuthenticated, user } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'buyer' | 'seller'>('buyer');
  
  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewingOrder, setReviewingOrder] = useState<Order | null>(null);
  const [reviewScore, setReviewScore] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewedOrders, setReviewedOrders] = useState<Set<string>>(new Set());
  
  // Status labels with translations
  const statusLabels: Record<string, { label: string; color: string }> = {
    pending_payment: { label: t('order.statusPending'), color: 'text-yellow-400 bg-yellow-400/10' },
    paid: { label: t('order.statusPaid'), color: 'text-green-400 bg-green-400/10' },
    preparing: { label: t('order.statusProcessing'), color: 'text-orange-400 bg-orange-400/10' },
    shipped: { label: t('order.statusShipped'), color: 'text-purple-400 bg-purple-400/10' },
    delivered: { label: t('order.statusDelivered'), color: 'text-green-400 bg-green-400/10' },
    completed: { label: t('order.statusDelivered'), color: 'text-green-400 bg-green-400/10' },
    cancelled: { label: t('order.statusCancelled'), color: 'text-red-400 bg-red-400/10' },
    refund_requested: { label: t('order.refundStarted'), color: 'text-orange-400 bg-orange-400/10' },
    refunded: { label: t('order.statusRefunded'), color: 'text-gray-400 bg-gray-400/10' },
  };
  
  // Seller rating state
  const [sellerCommunication, setSellerCommunication] = useState(5);
  const [sellerShipping, setSellerShipping] = useState(5);
  const [sellerPackaging, setSellerPackaging] = useState(5);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadOrders();
  }, [isAuthenticated, filter]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await api.get('/orders', {
        params: { role: filter === 'all' ? undefined : filter },
      });
      setOrders(response.data.orders || response.data.data || []);
    } catch (error) {
      console.error('Orders load error:', error);
    } finally {
      setLoading(false);
    }
  };

  const openReviewModal = (order: Order) => {
    setReviewingOrder(order);
    setReviewScore(5);
    setReviewTitle('');
    setReviewText('');
    setSellerCommunication(5);
    setSellerShipping(5);
    setSellerPackaging(5);
    setShowReviewModal(true);
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
      // Submit product rating
      await ratingsApi.createProductRating({
        productId,
        orderId: reviewingOrder.id,
        score: reviewScore,
        title: reviewTitle || undefined,
        review: reviewText || undefined,
      });

      // Submit seller rating (if seller exists)
      if (sellerId) {
        const avgSellerScore = Math.round((sellerCommunication + sellerShipping + sellerPackaging) / 3);
        await ratingsApi.createUserRating({
          receiverId: sellerId,
          orderId: reviewingOrder.id,
          score: avgSellerScore,
          comment: `İletişim: ${sellerCommunication}/5, Kargo: ${sellerShipping}/5, Paketleme: ${sellerPackaging}/5`,
        });
      }

      toast.success(t('review.reviewSubmitted'));
      setShowReviewModal(false);
      setReviewedOrders(prev => new Set([...prev, reviewingOrder.id]));
    } catch (error: any) {
      console.error('Review submit error:', error);
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
    const notAlreadyReviewed = !reviewedOrders.has(order.id);
    return isBuyer && isReviewableStatus && notAlreadyReviewed;
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{t('order.myOrders')}</h1>
          <div className="flex gap-2">
            {(['buyer', 'seller', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-primary-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {f === 'buyer' ? t('profile.totalPurchases') : f === 'seller' ? t('profile.totalSales') : t('common.all')}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl">
            <p className="text-gray-500">{t('order.noOrders')}</p>
            <Link
              href="/listings"
              className="inline-block mt-4 px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors"
            >
              {t('cart.browseListings')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const status = statusLabels[order.status] || {
                label: order.status,
                color: 'text-gray-600 bg-gray-100',
              };

              return (
                <div key={order.id} className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-sm text-gray-500">
                        {t('order.orderNumber')} #{order.orderNumber}
                      </p>
                      <p className="text-sm text-gray-400">
                        {new Date(order.createdAt).toLocaleDateString('tr-TR')}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Ürün bilgisi - items veya product'tan al */}
                    {(() => {
                      const productInfo = order.product || order.items?.[0]?.product;
                      const productImage = productInfo?.imageUrl || order.items?.[0]?.product?.imageUrl;
                      const orderPrice = Number(order.totalAmount) || Number(order.amount) || order.items?.[0]?.price || 0;
                      
                      return productInfo ? (
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
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
                              className="font-medium text-gray-900 hover:text-primary-500 transition-colors"
                            >
                              {productInfo.title || (locale === 'en' ? 'Product' : 'Ürün')}
                            </Link>
                            <p className="text-sm text-gray-500">
                              1 {locale === 'en' ? 'x' : 'adet ×'} {orderPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500">{locale === 'en' ? 'Product info could not be loaded' : 'Ürün bilgisi yüklenemedi'}</p>
                      );
                    })()}
                  </div>

                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                    <div className="text-sm text-gray-500">
                      {order.isBuyer !== false ? (
                        <>{t('product.seller')}: {order.seller?.displayName || t('product.seller')}</>
                      ) : (
                        <>{t('product.seller')}: {order.buyer?.displayName}</>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-primary-500">
                        {(Number(order.totalAmount) || Number(order.amount) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                      </p>
                    </div>
                  </div>

                  {order.shipment && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm">
                        <span className="text-gray-500">{t('order.shippingCompany')}:</span>{' '}
                        {order.shipment.carrier || order.shipment.provider}
                      </p>
                      <p className="text-sm">
                        <span className="text-gray-500">{t('order.trackingNumber')}:</span>{' '}
                        <span className="font-mono">{order.shipment.trackingNumber}</span>
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    <Link
                      href={`/orders/${order.id}`}
                      className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
                    >
                      {t('common.details')}
                    </Link>
                    {canReview(order) && (
                      <button 
                        onClick={() => openReviewModal(order)}
                        className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors text-sm flex items-center gap-1"
                      >
                        <StarIcon className="w-4 h-4" />
                        {t('review.writeReview')}
                      </button>
                    )}
                    {order.status === 'delivered' && (
                      <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm">
                        {t('order.statusDelivered')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Review Modal */}
        {showReviewModal && reviewingOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 my-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{t('review.reviewOrder')}</h2>
              
              {/* Product Section */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  📦 {t('review.productReview')}
                </h3>
                
                {(reviewingOrder.product || reviewingOrder.items?.[0]?.product) && (
                  <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-2xl overflow-hidden">
                      {(reviewingOrder.product?.imageUrl || reviewingOrder.items?.[0]?.product?.imageUrl) ? (
                        <img
                          src={reviewingOrder.product?.imageUrl || reviewingOrder.items?.[0]?.product?.imageUrl}
                          alt={locale === 'en' ? 'Product' : 'Ürün'}
                          className="w-full h-full object-cover"
                        />
                      ) : '🚗'}
                    </div>
                    <p className="font-medium text-gray-900">
                      {reviewingOrder.product?.title || reviewingOrder.items?.[0]?.product?.title}
                    </p>
                  </div>
                )}

                {/* Product Star Rating */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('review.productScore')}</label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewScore(star)}
                        className="p-1 hover:scale-110 transition-transform"
                      >
                        {star <= reviewScore ? (
                          <StarIcon className="w-8 h-8 text-yellow-400" />
                        ) : (
                          <StarOutlineIcon className="w-8 h-8 text-gray-300" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('review.titleOptional')}
                  </label>
                  <input
                    type="text"
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    placeholder={locale === 'en' ? 'E.g.: Great product!' : 'Örn: Harika bir ürün!'}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    maxLength={100}
                  />
                </div>

                {/* Review Text */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('review.commentOptional')}
                  </label>
                  <textarea
                    value={reviewText}
                    onChange={(e) => setReviewText(e.target.value)}
                    placeholder={locale === 'en' ? 'Share your experience about the product...' : 'Ürün hakkında deneyiminizi paylaşın...'}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    maxLength={1000}
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 my-6"></div>

              {/* Seller Section */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                  👤 {t('review.sellerReview')}
                </h3>
                
                {reviewingOrder.seller && (
                  <p className="text-sm text-gray-600 mb-4">
                    {t('product.seller')}: <span className="font-medium text-gray-900">{reviewingOrder.seller.displayName}</span>
                  </p>
                )}

                {/* Seller Rating Categories */}
                <div className="space-y-3">
                  {/* Communication */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{t('review.communication')}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSellerCommunication(star)}
                          className="p-0.5 hover:scale-110 transition-transform"
                        >
                          {star <= sellerCommunication ? (
                            <StarIcon className="w-5 h-5 text-yellow-400" />
                          ) : (
                            <StarOutlineIcon className="w-5 h-5 text-gray-300" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Shipping Speed */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{t('review.shippingSpeed')}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSellerShipping(star)}
                          className="p-0.5 hover:scale-110 transition-transform"
                        >
                          {star <= sellerShipping ? (
                            <StarIcon className="w-5 h-5 text-yellow-400" />
                          ) : (
                            <StarOutlineIcon className="w-5 h-5 text-gray-300" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Packaging */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{t('review.packaging')}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSellerPackaging(star)}
                          className="p-0.5 hover:scale-110 transition-transform"
                        >
                          {star <= sellerPackaging ? (
                            <StarIcon className="w-5 h-5 text-yellow-400" />
                          ) : (
                            <StarOutlineIcon className="w-5 h-5 text-gray-300" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowReviewModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={submitReview}
                  disabled={submittingReview}
                  className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  {submittingReview ? t('common.sending') : t('review.submit')}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
