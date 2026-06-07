'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import OptimizedImage from '@/components/OptimizedImage';
import UserAvatar from '@/components/UserAvatar';
import { motion, AnimatePresence } from 'framer-motion';
import {
  InboxArrowDownIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  ChatBubbleLeftIcon,
  ArrowLeftIcon,
  TagIcon,
  CalendarIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { useAuthStore } from '@/stores/authStore';
import { api, ordersApi } from '@/lib/api';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { useTranslation } from '@/i18n/LanguageContext';
import { Button, Input, Spinner, StatusBadge, offerStatusConfig } from '@tarodan/ui';

interface Offer {
  id: string;
  amount: number;
  /** Satıcı karşı teklifinden sonra kabul/red sırası alıcıda */
  buyerMustAccept?: boolean;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'cancelled' | 'expired';
  cancelReason?: string | null;
  orderId?: string | null;
  orderStatus?: string | null;
  message?: string;
  expiresAt: string;
  createdAt: string;
  product: {
    id: string;
    title: string;
    price: number;
    oldPrice?: number | null;
    originalPrice?: number | null;
    salePrice?: number | null;
    isOnSale?: boolean;
    imageUrl?: string;
    images?: { cardUrl?: string; detailUrl?: string; url?: string }[];
    categoryId?: string | null;
  };
  buyer?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
  seller?: {
    id: string;
    displayName: string;
    avatarUrl?: string;
  };
}

function formatTimeAgo(timestamp: string, locale: string = 'tr'): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 0) return locale === 'en' ? 'just now' : 'az önce';
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return locale === 'en' ? 'just now' : 'az önce';
  if (minutes < 60) return locale === 'en' ? `${minutes} min ago` : `${minutes} dk önce`;
  if (hours < 24) return locale === 'en' ? `${hours} hr ago` : `${hours} saat önce`;
  if (days < 30) return locale === 'en' ? `${days} day${days === 1 ? '' : 's'} ago` : `${days} gün önce`;
  const months = Math.floor(days / 30);
  return locale === 'en' ? `${months} month${months === 1 ? '' : 's'} ago` : `${months} ay önce`;
}

function OffersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user } = useAuthStore();
  const { t, locale } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<'sent' | 'received'>(tabParam === 'sent' ? 'sent' : 'received');

  const switchTab = (tab: 'sent' | 'received') => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [estimatedNetByOfferId, setEstimatedNetByOfferId] = useState<Record<string, number>>({});
  const [buyerCounterOpen, setBuyerCounterOpen] = useState(false);
  const [buyerCounterOffer, setBuyerCounterOffer] = useState<Offer | null>(null);
  const [buyerCounterAmt, setBuyerCounterAmt] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/offers');
      return;
    }
  }, [mounted, authLoading, isAuthenticated, router]);

  const offersQuery = useQuery({
    queryKey: ['offers', activeTab],
    queryFn: async (): Promise<Offer[]> => {
      const response = await api.get('/offers', {
        params: { type: activeTab }
      });
      return response.data?.data || response.data?.offers || [];
    },
    enabled: isAuthenticated,
    meta: { page: 'offers' },
  });
  const offers = offersQuery.data ?? [];
  const loading = offersQuery.isLoading;
  const error = offersQuery.isError ? (locale === 'en' ? 'Failed to load offers' : 'Teklifler yüklenirken bir hata oluştu') : null;

  const invalidateOffers = () => queryClient.invalidateQueries({ queryKey: ['offers'] });

  const pendingReceivedOffers =
    activeTab === 'received'
      ? offers.filter((o) => o.status === 'pending' && !o.buyerMustAccept)
      : [];
  useEffect(() => {
    if (pendingReceivedOffers.length === 0) {
      setEstimatedNetByOfferId({});
      return;
    }
    ordersApi
      .getCommissionPreviewBatch(
        pendingReceivedOffers.map((o) => ({
          amount: Number(o.amount),
          categoryId: o.product?.categoryId ?? null,
        })),
      )
      .then((res) => {
        if (res.data?.results && Array.isArray(res.data.results)) {
          const map: Record<string, number> = {};
          pendingReceivedOffers.forEach((o, i) => {
            const r = res.data.results[i];
            if (r != null && typeof r.sellerNetAmount === 'number') map[o.id] = r.sellerNetAmount;
          });
          setEstimatedNetByOfferId(map);
        }
      })
      .catch(() => setEstimatedNetByOfferId({}));
  }, [activeTab, pendingReceivedOffers.length, pendingReceivedOffers.map((o) => `${o.id}-${o.amount}-${o.product?.categoryId}`).join(',')]);

  const handleAccept = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await api.post(`/offers/${offerId}/accept`);
      await invalidateOffers();
    } catch (err: any) {
      alert(err.response?.data?.message || (locale === 'en' ? 'Failed to accept offer' : 'Teklif kabul edilirken hata oluştu'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await api.post(`/offers/${offerId}/reject`);
      await invalidateOffers();
    } catch (err: any) {
      alert(err.response?.data?.message || (locale === 'en' ? 'Failed to reject offer' : 'Teklif reddedilirken hata oluştu'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await api.post(`/offers/${offerId}/cancel`);
      await invalidateOffers();
    } catch (err: any) {
      alert(err.response?.data?.message || (locale === 'en' ? 'Failed to cancel offer' : 'Teklif iptal edilirken hata oluştu'));
    } finally {
      setActionLoading(null);
    }
  };

  const openBuyerCounterModal = (offer: Offer) => {
    setBuyerCounterOffer(offer);
    setBuyerCounterAmt('');
    setBuyerCounterOpen(true);
  };

  const submitBuyerCounter = async () => {
    if (!buyerCounterOffer) return;
    const amount = parseFloat(buyerCounterAmt.replace(',', '.'));
    if (Number.isNaN(amount) || amount <= 0) {
      alert(locale === 'en' ? 'Enter a valid amount' : 'Geçerli bir tutar girin');
      return;
    }
    if (amount >= Number(buyerCounterOffer.amount)) {
      alert(
        locale === 'en'
          ? `Your offer must be below the seller's counter (₺${Number(buyerCounterOffer.amount).toLocaleString('tr-TR')}).`
          : `Satıcının karşı teklifinden (₺${Number(buyerCounterOffer.amount).toLocaleString('tr-TR')}) düşük olmalıdır.`,
      );
      return;
    }
    setActionLoading(buyerCounterOffer.id);
    try {
      await api.post(`/offers/${buyerCounterOffer.id}/buyer-counter`, { amount });
      setBuyerCounterOpen(false);
      setBuyerCounterOffer(null);
      await invalidateOffers();
    } catch (err: any) {
      alert(err.response?.data?.message || (locale === 'en' ? 'Failed to send counter' : 'Karşı teklif gönderilemedi'));
    } finally {
      setActionLoading(null);
    }
  };

  const offerStatusEnLabels: Record<string, string> = {
    pending: 'Pending',
    accepted: 'Accepted',
    rejected: 'Rejected',
    countered: 'Counter Offer',
    cancelled: 'Cancelled',
    expired: 'Expired',
    payment_expired: 'Payment Expired',
  };
  const getOfferStatusLabel = (s: string) => locale === 'en' ? (offerStatusEnLabels[s] || s) : (offerStatusConfig[s]?.label || s);

  const calculateDiscount = (offerAmount: number, listingPrice: number) => {
    return Math.round(((listingPrice - offerAmount) / listingPrice) * 100);
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return null;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} gün`;
    }
    return `${hours}s ${minutes}d`;
  };

  // Stats
  const pendingCount = offers.filter(o => o.status === 'pending').length;
  const acceptedCount = offers.filter(o => o.status === 'accepted').length;
  const totalValue = offers.reduce((sum, o) => sum + o.amount, 0);

  const showPlaceholder = !mounted || !isAuthenticated;
  if (showPlaceholder) {
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
      {/* Header */}
      <div className="bg-surface-elevated border-b border-border">
        <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-xl font-semibold text-heading">
                <span className="w-1 h-6 bg-primary-500 rounded-sm" />
                {locale === 'en' ? 'My Offers' : 'Tekliflerim'}
              </h1>
              <p className="text-sm text-muted mt-1">
                {locale === 'en' ? 'Manage your offers and negotiations' : 'Tekliflerinizi ve pazarlıklarınızı yönetin'}
              </p>
            </div>
            <Link
              href="/profile"
              className="flex items-center gap-2 text-sm font-medium text-muted hover:text-heading transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              {locale === 'en' ? 'Back to Profile' : 'Profile Dön'}
            </Link>
          </div>

          {/* Stats Row */}
          <div className="mt-4 flex flex-wrap gap-4 bg-surface-elevated rounded border border-border p-4">
            <div className="flex items-center gap-3">
              <ClockIcon className="w-5 h-5 text-warning-500" />
              <div>
                <p className="text-lg font-semibold text-heading">{pendingCount}</p>
                <p className="text-xs text-muted">{locale === 'en' ? 'Pending' : 'Bekleyen'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircleIcon className="w-5 h-5 text-success-500" />
              <div>
                <p className="text-lg font-semibold text-heading">{acceptedCount}</p>
                <p className="text-xs text-muted">{locale === 'en' ? 'Accepted' : 'Kabul Edilen'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <TagIcon className="w-5 h-5 text-primary-500" />
              <div>
                <p className="text-lg font-semibold text-heading">₺{totalValue.toLocaleString('tr-TR')}</p>
                <p className="text-xs text-muted">{locale === 'en' ? 'Total Value' : 'Toplam Değer'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto px-6 sm:px-8 lg:px-12 xl:px-16 py-6">
        {/* Tabs */}
        <div className="bg-surface-alt rounded p-0.5 mb-6 inline-flex">
          <Button variant="secondary" onClick={() => switchTab('received')}
            className={`flex items-center gap-2 px-6 py-3 rounded text-sm font-medium transition-all ${
              activeTab === 'received'
                ? 'bg-surface-elevated text-heading shadow-sm'
                : 'text-muted hover:text-heading'
            }`}>
            <InboxArrowDownIcon className="w-5 h-5" />
            {locale === 'en' ? 'Received' : 'Gelen Teklifler'}
          </Button>
          <Button variant="secondary" onClick={() => switchTab('sent')}
            className={`flex items-center gap-2 px-6 py-3 rounded text-sm font-medium transition-all ${
              activeTab === 'sent'
                ? 'bg-surface-elevated text-heading shadow-sm'
                : 'text-muted hover:text-heading'
            }`}>
            <PaperAirplaneIcon className="w-5 h-5" />
            {locale === 'en' ? 'Sent' : 'Gönderilen Teklifler'}
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Spinner size="xl" color="border-primary-500 border-t-transparent" className="mb-4" />
            <p className="text-muted">{locale === 'en' ? 'Loading offers...' : 'Teklifler yükleniyor...'}</p>
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16 bg-surface-elevated rounded shadow-sm"
          >
            <ExclamationCircleIcon className="w-16 h-16 text-danger-400 mx-auto mb-4" />
            <p className="text-danger-500 mb-4">{error}</p>
            <Button
              variant="primary"
              size="md"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['offers'] })}
            >
              {locale === 'en' ? 'Try Again' : 'Tekrar Dene'}
            </Button>
          </motion.div>
        ) : offers.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 bg-surface-elevated rounded shadow-sm"
          >
            <div className="w-20 h-20 bg-primary-100 rounded flex items-center justify-center mx-auto mb-4">
              {activeTab === 'received' ? (
                <InboxArrowDownIcon className="w-10 h-10 text-primary-500" />
              ) : (
                <PaperAirplaneIcon className="w-10 h-10 text-primary-500" />
              )}
            </div>
            <h3 className="text-xl font-semibold text-heading mb-2">
              {activeTab === 'received'
                ? (locale === 'en' ? 'No offers received yet' : 'Henüz gelen teklif yok')
                : (locale === 'en' ? 'No offers sent yet' : 'Henüz gönderilen teklif yok')}
            </h3>
            <p className="text-muted mb-6 max-w-md mx-auto">
              {activeTab === 'received'
                ? (locale === 'en' ? 'When buyers make offers on your listings, they will appear here.' : 'Alıcılar ilanlarınıza teklif verdiğinde burada görünecek.')
                : (locale === 'en' ? 'Start browsing listings and make your first offer!' : 'İlanlara göz atın ve ilk teklifinizi yapın!')}
            </p>
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-inverted rounded text-sm font-medium transition-colors"
            >
              <TagIcon className="w-5 h-5" />
              {locale === 'en' ? 'Browse Listings' : 'İlanlara Göz At'}
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {offers.map((offer, index) => {
                // An accepted offer stays `accepted` after payment; the paid
                // state lives on the linked order. Surface it as "Ödendi" so a
                // sold offer is not visually indistinguishable from a merely
                // accepted (still-payable) one.
                const offerOrderPaid =
                  offer.status === 'accepted' &&
                  ['paid', 'preparing', 'shipped', 'delivered', 'completed'].includes(
                    offer.orderStatus ?? '',
                  );
                const offerStatusLabel = offerOrderPaid
                  ? (locale === 'en' ? 'Paid' : 'Ödendi')
                  : getOfferStatusLabel(offer.status);
                const listingEffectivePrice = getProductEffectivePrice(offer.product);
                const discount = calculateDiscount(offer.amount, listingEffectivePrice);
                const timeRemaining = offer.status === 'pending' ? getTimeRemaining(offer.expiresAt) : null;
                const otherUser = activeTab === 'received' ? offer.buyer : offer.seller;

                return (
                  <motion.div
                    key={offer.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-surface-elevated rounded shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col md:flex-row">
                      {/* Product Image */}
                      <Link
                        href={`/listings/${offer.product.id}`}
                        className="relative w-full md:w-48 h-48 md:h-auto flex-shrink-0 group"
                      >
                        {(() => {
                          const img0 = offer.product.images?.[0] as any;
                          const src =
                            img0?.cardUrl ??
                            img0?.detailUrl ??
                            img0?.url ??
                            offer.product.imageUrl;
                          return src ? (
                            <OptimizedImage
                              src={src}
                              alt={offer.product.title}
                              fill
                              className="object-cover group-hover:scale-105 transition-transform duration-300"
                              fallbackSrc="https://placehold.co/400x400/f3f4f6/9ca3af?text=Ürün"
                              logContext={{ productId: offer.product.id, page: 'offers' }}
                            />
                          ) : (
                          <div className="w-full h-full bg-primary-100 flex items-center justify-center">
                            <TagIcon className="w-10 h-10 text-primary-400" />
                          </div>
                          );
                        })()}
                        {/* Discount Badge */}
                        {discount > 0 && (
                          <div className="absolute top-3 left-3 bg-danger-500 text-inverted px-2 py-1 rounded text-sm font-bold flex items-center gap-1">
                            <ArrowTrendingDownIcon className="w-4 h-4" />
                            %{discount}
                          </div>
                        )}
                      </Link>

                      {/* Content */}
                      <div className="flex-1 p-5">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex-1">
                            <Link
                              href={`/listings/${offer.product.id}`}
                              className="text-lg font-semibold text-heading hover:text-primary-500 transition-colors line-clamp-1"
                            >
                              {offer.product.title}
                            </Link>
                            <p className="text-muted text-sm mt-1">
                              {locale === 'en' ? 'Listing Price:' : 'İlan Fiyatı:'} <span className="line-through">₺{listingEffectivePrice.toLocaleString('tr-TR')}</span>
                            </p>
                          </div>

                          {/* Status Badge */}
                          <div className="flex flex-col items-end gap-1">
                            <StatusBadge
                              status={offer.status}
                              config={offerStatusConfig}
                              label={offerStatusLabel}
                            />
                            {offer.status === 'cancelled' && offer.cancelReason && (
                              <p className="text-xs text-muted">{offer.cancelReason}</p>
                            )}
                          </div>
                        </div>

                        {/* Offer Amount & User */}
                        <div className="flex flex-wrap items-center gap-3 sm:gap-6 mb-4">
                          <div className="bg-primary-50 border border-primary-200 rounded px-3 py-2 sm:px-4 sm:py-3">
                            <p className="text-[10px] sm:text-xs text-muted mb-0.5 sm:mb-1">{locale === 'en' ? 'Offer Amount' : 'Teklif Tutarı'}</p>
                            <p className="text-lg sm:text-2xl font-bold text-primary-600">
                              ₺{offer.amount.toLocaleString('tr-TR')}
                            </p>
                            {activeTab === 'received' && offer.status === 'pending' && estimatedNetByOfferId[offer.id] != null && (
                              <p className="text-xs text-success-600 mt-1">
                                {locale === 'en' ? 'Est. net to you' : 'Tahmini net kazanç'}: ₺{Number(estimatedNetByOfferId[offer.id]).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>

                          {otherUser && (
                            <div className="flex items-center gap-2 sm:gap-3">
                              <UserAvatar
                                displayName={otherUser.displayName}
                                avatarUrl={otherUser.avatarUrl}
                                size="sm"
                              />
                              <div>
                                <p className="text-[10px] sm:text-xs text-muted">
                                  {activeTab === 'received' ? (locale === 'en' ? 'From' : 'Teklif Veren') : (locale === 'en' ? 'Seller' : 'Satıcı')}
                                </p>
                                <p className="text-sm sm:text-base font-medium text-heading">{otherUser.displayName}</p>
                              </div>
                            </div>
                          )}

                          {timeRemaining && (
                            <div className="flex items-center gap-1.5 sm:gap-2 text-warning-600 bg-warning-50 px-2 py-1.5 sm:px-3 sm:py-2 rounded">
                              <ClockIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              <span className="text-xs sm:text-sm font-medium whitespace-nowrap">{timeRemaining} kaldı</span>
                            </div>
                          )}
                        </div>

                        {/* Message */}
                        {offer.message && (
                          <div className="flex items-start gap-2 bg-surface rounded p-3 mb-4">
                            <ChatBubbleLeftIcon className="w-5 h-5 text-subtle flex-shrink-0 mt-0.5" />
                            <p className="text-muted text-sm italic">"{offer.message}"</p>
                          </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
                          <div className="flex items-center gap-2 text-subtle text-sm">
                            <CalendarIcon className="w-4 h-4" />
                            <span title={new Date(offer.createdAt).toLocaleString(locale === 'en' ? 'en-US' : 'tr-TR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}>
                              {formatTimeAgo(offer.createdAt, locale)}
                            </span>
                          </div>

                          {/* Actions */}
                          {offer.status === 'pending' && (
                            <div className="flex flex-wrap items-center gap-2 justify-end">
                              {activeTab === 'received' && offer.buyerMustAccept ? (
                                <span className="text-sm text-warning-700 bg-warning-50 px-3 py-2 rounded">
                                  {locale === 'en'
                                    ? 'Waiting for the buyer to accept or decline your counter offer.'
                                    : 'Alıcının karşı teklifinizi kabul veya reddetmesi bekleniyor.'}
                                </span>
                              ) : activeTab === 'received' ? (
                                <>
                                  <Button
                                    variant="success"
                                    size="sm"
                                    className="flex items-center gap-2"
                                    onClick={() => handleAccept(offer.id)}
                                    disabled={actionLoading === offer.id}
                                  >
                                    {actionLoading === offer.id ? (
                                      <Spinner size="sm" color="border-surface-elevated border-t-transparent" />
                                    ) : (
                                      <CheckIcon className="w-4 h-4" />
                                    )}
                                    {locale === 'en' ? 'Accept' : 'Kabul Et'}
                                  </Button>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    className="flex items-center gap-2"
                                    onClick={() => handleReject(offer.id)}
                                    disabled={actionLoading === offer.id}
                                  >
                                    <XMarkIcon className="w-4 h-4" />
                                    {locale === 'en' ? 'Reject' : 'Reddet'}
                                  </Button>
                                </>
                              ) : offer.buyerMustAccept ? (
                                <>
                                  <Button
                                    variant="success"
                                    size="sm"
                                    className="flex items-center gap-2"
                                    onClick={() => handleAccept(offer.id)}
                                    disabled={actionLoading === offer.id}
                                  >
                                    {actionLoading === offer.id ? (
                                      <Spinner size="sm" color="border-surface-elevated border-t-transparent" />
                                    ) : (
                                      <CheckIcon className="w-4 h-4" />
                                    )}
                                    {locale === 'en' ? 'Accept counter offer' : 'Karşı teklifi kabul et'}
                                  </Button>
                                  <Button
                                    variant="danger"
                                    size="sm"
                                    className="flex items-center gap-2"
                                    onClick={() => handleReject(offer.id)}
                                    disabled={actionLoading === offer.id}
                                  >
                                    <XMarkIcon className="w-4 h-4" />
                                    {locale === 'en' ? 'Decline' : 'Reddet'}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    className="flex items-center gap-2"
                                    onClick={() => openBuyerCounterModal(offer)}
                                    disabled={actionLoading === offer.id}
                                  >
                                    <ArrowTrendingDownIcon className="w-4 h-4" />
                                    {locale === 'en' ? 'Lower offer' : 'Daha düşük teklif'}
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="flex items-center gap-2"
                                  onClick={() => handleCancel(offer.id)}
                                  disabled={actionLoading === offer.id}
                                >
                                  {actionLoading === offer.id ? (
                                    <Spinner size="sm" color="border-surface-elevated border-t-transparent" />
                                  ) : (
                                    <XMarkIcon className="w-4 h-4" />
                                  )}
                                  {locale === 'en' ? 'Cancel' : 'İptal Et'}
                                </Button>
                              )}
                            </div>
                          )}

                          {offer.status === 'accepted' && (() => {
                            const paidStatuses = ['paid', 'preparing', 'shipped', 'delivered', 'completed'];
                            const isOrderPaid = paidStatuses.includes(offer.orderStatus ?? '');
                            const showPayButton = activeTab === 'sent' && !isOrderPaid;
                            return (
                              <Link
                                href={offer.orderId ? `/orders/${offer.orderId}` : '/orders'}
                                className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${
                                  showPayButton
                                    ? 'bg-success-600 hover:bg-success-700 text-inverted'
                                    : 'bg-primary-500 hover:bg-primary-600 text-inverted'
                                }`}
                              >
                                {showPayButton
                                  ? (locale === 'en' ? 'Pay Now' : 'Ödeme Yap')
                                  : (locale === 'en' ? 'View Order' : 'Siparişi Görüntüle')}
                              </Link>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {buyerCounterOpen && buyerCounterOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-heading/50 p-4" role="dialog" aria-modal="true">
          <div className="bg-surface-elevated rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-heading mb-2">
              {locale === 'en' ? 'Counter with a lower amount' : 'Daha düşük teklif'}
            </h3>
            <p className="text-sm text-muted mb-4">
              {locale === 'en' ? "Seller's counter:" : 'Satıcının karşı teklifi:'}{' '}
              <strong>₺{Number(buyerCounterOffer.amount).toLocaleString('tr-TR')}</strong>.{' '}
              {locale === 'en'
                ? 'Enter an amount below that and at least 50% of the listing price (server validates).'
                : 'Bu tutarın altında, ilan fiyatının en az %50 kadarına uygun bir teklif girin.'}
            </p>
            <Input type="text"
              inputMode="decimal"
              className="mb-4"
              placeholder={locale === 'en' ? 'Amount (TRY)' : 'Tutar (₺)'}
              value={buyerCounterAmt}
              onChange={(e) => setBuyerCounterAmt(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={() => {
                  setBuyerCounterOpen(false);
                  setBuyerCounterOffer(null);
                }}
              >
                {locale === 'en' ? 'Cancel' : 'Vazgeç'}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={actionLoading === buyerCounterOffer.id}
                onClick={() => submitBuyerCounter()}
              >
                {locale === 'en' ? 'Send' : 'Gönder'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OffersPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface flex items-center justify-center"><Spinner size="lg" color="border-primary-500 border-t-transparent" /></div>}>
      <OffersPageContent />
    </Suspense>
  );
}
