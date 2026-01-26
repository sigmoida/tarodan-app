'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CurrencyDollarIcon,
  InboxArrowDownIcon,
  PaperAirplaneIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  ChatBubbleLeftIcon,
  ArrowLeftIcon,
  TagIcon,
  UserIcon,
  CalendarIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';

interface Offer {
  id: string;
  amount: number;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'cancelled' | 'expired';
  message?: string;
  expiresAt: string;
  createdAt: string;
  product: {
    id: string;
    title: string;
    price: number;
    images: { url: string }[];
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

export default function OffersPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { t, locale } = useTranslation();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sent' | 'received'>('received');
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadOffers();
  }, [isAuthenticated, activeTab]);

  const loadOffers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/offers', {
        params: { role: activeTab === 'sent' ? 'buyer' : 'seller' }
      });
      setOffers(response.data?.data || response.data?.offers || []);
    } catch (err: any) {
      console.error('Offers load error:', err);
      setError(locale === 'en' ? 'Failed to load offers' : 'Teklifler yüklenirken bir hata oluştu');
      setOffers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (offerId: string) => {
    setActionLoading(offerId);
    try {
      await api.post(`/offers/${offerId}/accept`);
      loadOffers();
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
      loadOffers();
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
      loadOffers();
    } catch (err: any) {
      alert(err.response?.data?.message || (locale === 'en' ? 'Failed to cancel offer' : 'Teklif iptal edilirken hata oluştu'));
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { bg: string; text: string; icon: any; label: string }> = {
      pending: {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        icon: ClockIcon,
        label: locale === 'en' ? 'Pending' : 'Bekliyor',
      },
      accepted: {
        bg: 'bg-green-100',
        text: 'text-green-700',
        icon: CheckCircleIcon,
        label: locale === 'en' ? 'Accepted' : 'Kabul Edildi',
      },
      rejected: {
        bg: 'bg-red-100',
        text: 'text-red-700',
        icon: XCircleIcon,
        label: locale === 'en' ? 'Rejected' : 'Reddedildi',
      },
      countered: {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        icon: ArrowPathIcon,
        label: locale === 'en' ? 'Counter Offer' : 'Karşı Teklif',
      },
      cancelled: {
        bg: 'bg-gray-100',
        text: 'text-gray-700',
        icon: XCircleIcon,
        label: locale === 'en' ? 'Cancelled' : 'İptal Edildi',
      },
      expired: {
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        icon: ExclamationCircleIcon,
        label: locale === 'en' ? 'Expired' : 'Süresi Doldu',
      },
    };
    return configs[status] || configs.pending;
  };

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

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <Link
              href="/profile"
              className="flex items-center gap-2 text-white/80 hover:text-white transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              <span>{locale === 'en' ? 'Back to Profile' : 'Profile Dön'}</span>
            </Link>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <CurrencyDollarIcon className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">
                {locale === 'en' ? 'My Offers' : 'Tekliflerim'}
              </h1>
              <p className="text-orange-100">
                {locale === 'en' ? 'Manage your offers and negotiations' : 'Tekliflerinizi ve pazarlıklarınızı yönetin'}
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/10 backdrop-blur-sm rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <ClockIcon className="w-8 h-8 text-amber-200" />
                <div>
                  <p className="text-2xl font-bold text-white">{pendingCount}</p>
                  <p className="text-sm text-orange-100">{locale === 'en' ? 'Pending' : 'Bekleyen'}</p>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white/10 backdrop-blur-sm rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <CheckCircleIcon className="w-8 h-8 text-green-300" />
                <div>
                  <p className="text-2xl font-bold text-white">{acceptedCount}</p>
                  <p className="text-sm text-orange-100">{locale === 'en' ? 'Accepted' : 'Kabul Edilen'}</p>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white/10 backdrop-blur-sm rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <TagIcon className="w-8 h-8 text-white" />
                <div>
                  <p className="text-2xl font-bold text-white">₺{totalValue.toLocaleString('tr-TR')}</p>
                  <p className="text-sm text-orange-100">{locale === 'en' ? 'Total Value' : 'Toplam Değer'}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm p-2 mb-6 inline-flex">
          <button
            onClick={() => setActiveTab('received')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'received'
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <InboxArrowDownIcon className="w-5 h-5" />
            {locale === 'en' ? 'Received' : 'Gelen Teklifler'}
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all ${
              activeTab === 'sent'
                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <PaperAirplaneIcon className="w-5 h-5" />
            {locale === 'en' ? 'Sent' : 'Gönderilen Teklifler'}
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-orange-500 border-t-transparent mb-4"></div>
            <p className="text-gray-500">{locale === 'en' ? 'Loading offers...' : 'Teklifler yükleniyor...'}</p>
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-16 bg-white rounded-2xl shadow-sm"
          >
            <ExclamationCircleIcon className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={loadOffers}
              className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors"
            >
              {locale === 'en' ? 'Try Again' : 'Tekrar Dene'}
            </button>
          </motion.div>
        ) : offers.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16 bg-white rounded-2xl shadow-sm"
          >
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
              {activeTab === 'received' ? (
                <InboxArrowDownIcon className="w-10 h-10 text-orange-500" />
              ) : (
                <PaperAirplaneIcon className="w-10 h-10 text-orange-500" />
              )}
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {activeTab === 'received'
                ? (locale === 'en' ? 'No offers received yet' : 'Henüz gelen teklif yok')
                : (locale === 'en' ? 'No offers sent yet' : 'Henüz gönderilen teklif yok')}
            </h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              {activeTab === 'received'
                ? (locale === 'en' ? 'When buyers make offers on your listings, they will appear here.' : 'Alıcılar ilanlarınıza teklif verdiğinde burada görünecek.')
                : (locale === 'en' ? 'Start browsing listings and make your first offer!' : 'İlanlara göz atın ve ilk teklifinizi yapın!')}
            </p>
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
            >
              <TagIcon className="w-5 h-5" />
              {locale === 'en' ? 'Browse Listings' : 'İlanlara Göz At'}
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {offers.map((offer, index) => {
                const statusConfig = getStatusConfig(offer.status);
                const StatusIcon = statusConfig.icon;
                const discount = calculateDiscount(offer.amount, offer.product.price);
                const timeRemaining = offer.status === 'pending' ? getTimeRemaining(offer.expiresAt) : null;
                const otherUser = activeTab === 'received' ? offer.buyer : offer.seller;

                return (
                  <motion.div
                    key={offer.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ delay: index * 0.05 }}
                    className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col md:flex-row">
                      {/* Product Image */}
                      <Link
                        href={`/listings/${offer.product.id}`}
                        className="relative w-full md:w-48 h-48 md:h-auto flex-shrink-0 group"
                      >
                        {offer.product.images?.[0] ? (
                          <Image
                            src={offer.product.images[0].url}
                            alt={offer.product.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center">
                            <span className="text-5xl">🚗</span>
                          </div>
                        )}
                        {/* Discount Badge */}
                        {discount > 0 && (
                          <div className="absolute top-3 left-3 bg-red-500 text-white px-2 py-1 rounded-lg text-sm font-bold flex items-center gap-1">
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
                              className="text-lg font-semibold text-gray-900 hover:text-orange-500 transition-colors line-clamp-1"
                            >
                              {offer.product.title}
                            </Link>
                            <p className="text-gray-500 text-sm mt-1">
                              {locale === 'en' ? 'Listing Price:' : 'İlan Fiyatı:'} <span className="line-through">₺{offer.product.price.toLocaleString('tr-TR')}</span>
                            </p>
                          </div>

                          {/* Status Badge */}
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
                            <StatusIcon className="w-4 h-4" />
                            <span className="text-sm font-medium">{statusConfig.label}</span>
                          </div>
                        </div>

                        {/* Offer Amount & User */}
                        <div className="flex items-center gap-6 mb-4">
                          <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl px-4 py-3">
                            <p className="text-xs text-gray-500 mb-1">{locale === 'en' ? 'Offer Amount' : 'Teklif Tutarı'}</p>
                            <p className="text-2xl font-bold text-orange-600">
                              ₺{offer.amount.toLocaleString('tr-TR')}
                            </p>
                          </div>

                          {otherUser && (
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold">
                                {otherUser.avatarUrl ? (
                                  <Image
                                    src={otherUser.avatarUrl}
                                    alt={otherUser.displayName}
                                    width={40}
                                    height={40}
                                    className="w-full h-full rounded-full object-cover"
                                  />
                                ) : (
                                  otherUser.displayName.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">
                                  {activeTab === 'received' ? (locale === 'en' ? 'From' : 'Teklif Veren') : (locale === 'en' ? 'Seller' : 'Satıcı')}
                                </p>
                                <p className="font-medium text-gray-900">{otherUser.displayName}</p>
                              </div>
                            </div>
                          )}

                          {timeRemaining && (
                            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                              <ClockIcon className="w-4 h-4" />
                              <span className="text-sm font-medium">{timeRemaining} kaldı</span>
                            </div>
                          )}
                        </div>

                        {/* Message */}
                        {offer.message && (
                          <div className="flex items-start gap-2 bg-gray-50 rounded-lg p-3 mb-4">
                            <ChatBubbleLeftIcon className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                            <p className="text-gray-600 text-sm italic">"{offer.message}"</p>
                          </div>
                        )}

                        {/* Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <CalendarIcon className="w-4 h-4" />
                            {new Date(offer.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'tr-TR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>

                          {/* Actions */}
                          {offer.status === 'pending' && (
                            <div className="flex gap-2">
                              {activeTab === 'received' ? (
                                <>
                                  <button
                                    onClick={() => handleAccept(offer.id)}
                                    disabled={actionLoading === offer.id}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-xl text-sm font-medium transition-colors"
                                  >
                                    {actionLoading === offer.id ? (
                                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                      <CheckIcon className="w-4 h-4" />
                                    )}
                                    {locale === 'en' ? 'Accept' : 'Kabul Et'}
                                  </button>
                                  <button
                                    onClick={() => handleReject(offer.id)}
                                    disabled={actionLoading === offer.id}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl text-sm font-medium transition-colors"
                                  >
                                    <XMarkIcon className="w-4 h-4" />
                                    {locale === 'en' ? 'Reject' : 'Reddet'}
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleCancel(offer.id)}
                                  disabled={actionLoading === offer.id}
                                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 text-white rounded-xl text-sm font-medium transition-colors"
                                >
                                  {actionLoading === offer.id ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <XMarkIcon className="w-4 h-4" />
                                  )}
                                  {locale === 'en' ? 'Cancel' : 'İptal Et'}
                                </button>
                              )}
                            </div>
                          )}

                          {offer.status === 'accepted' && (
                            <Link
                              href="/orders"
                              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium transition-colors"
                            >
                              {locale === 'en' ? 'View Order' : 'Siparişi Görüntüle'}
                            </Link>
                          )}
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
    </div>
  );
}
