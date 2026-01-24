'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

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
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sent' | 'received'>('received');
  const [error, setError] = useState<string | null>(null);

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
      setError('Teklifler yüklenirken bir hata oluştu');
      setOffers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (offerId: string) => {
    try {
      await api.post(`/offers/${offerId}/accept`);
      loadOffers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Teklif kabul edilirken hata oluştu');
    }
  };

  const handleReject = async (offerId: string) => {
    try {
      await api.post(`/offers/${offerId}/reject`);
      loadOffers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Teklif reddedilirken hata oluştu');
    }
  };

  const handleCancel = async (offerId: string) => {
    try {
      await api.post(`/offers/${offerId}/cancel`);
      loadOffers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Teklif iptal edilirken hata oluştu');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      accepted: 'bg-green-500/20 text-green-400',
      rejected: 'bg-red-500/20 text-red-400',
      countered: 'bg-blue-500/20 text-blue-400',
      cancelled: 'bg-gray-500/20 text-gray-400',
      expired: 'bg-orange-500/20 text-orange-400',
    };
    const labels: Record<string, string> = {
      pending: 'Bekliyor',
      accepted: 'Kabul Edildi',
      rejected: 'Reddedildi',
      countered: 'Karşı Teklif',
      cancelled: 'İptal Edildi',
      expired: 'Süresi Doldu',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Tekliflerim</h1>
          <Link
            href="/profile"
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← Profile Dön
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('received')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'received'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Gelen Teklifler
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              activeTab === 'sent'
                ? 'bg-primary-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Gönderdiğim Teklifler
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400">{error}</p>
            <button
              onClick={loadOffers}
              className="mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              Tekrar Dene
            </button>
          </div>
        ) : offers.length === 0 ? (
          <div className="text-center py-12 bg-gray-800 rounded-xl">
            <p className="text-gray-400 text-lg">
              {activeTab === 'received'
                ? 'Henüz gelen teklifiniz yok'
                : 'Henüz gönderdiğiniz teklif yok'}
            </p>
            <Link
              href="/listings"
              className="inline-block mt-4 px-6 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors"
            >
              İlanlara Göz At
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => (
              <div
                key={offer.id}
                className="bg-gray-800 rounded-xl p-4 flex flex-col md:flex-row gap-4"
              >
                {/* Product Image */}
                <Link
                  href={`/listings/${offer.product.id}`}
                  className="w-full md:w-32 h-32 flex-shrink-0"
                >
                  {offer.product.images?.[0] ? (
                    <img
                      src={offer.product.images[0].url}
                      alt={offer.product.title}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-700 rounded-lg flex items-center justify-center">
                      <span className="text-4xl">🚗</span>
                    </div>
                  )}
                </Link>

                {/* Offer Details */}
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link
                        href={`/listings/${offer.product.id}`}
                        className="text-lg font-semibold hover:text-primary-400 transition-colors"
                      >
                        {offer.product.title}
                      </Link>
                      <p className="text-gray-400 text-sm mt-1">
                        İlan Fiyatı: ₺{offer.product.price.toLocaleString('tr-TR')}
                      </p>
                    </div>
                    {getStatusBadge(offer.status)}
                  </div>

                  <div className="mt-3 flex items-center gap-4">
                    <div className="bg-primary-500/20 px-4 py-2 rounded-lg">
                      <p className="text-xs text-gray-400">Teklif Tutarı</p>
                      <p className="text-xl font-bold text-primary-400">
                        ₺{offer.amount.toLocaleString('tr-TR')}
                      </p>
                    </div>

                    {activeTab === 'received' && offer.buyer && (
                      <div>
                        <p className="text-xs text-gray-400">Teklif Veren</p>
                        <p className="font-medium">{offer.buyer.displayName}</p>
                      </div>
                    )}

                    {activeTab === 'sent' && offer.seller && (
                      <div>
                        <p className="text-xs text-gray-400">Satıcı</p>
                        <p className="font-medium">{offer.seller.displayName}</p>
                      </div>
                    )}
                  </div>

                  {offer.message && (
                    <p className="mt-2 text-gray-400 text-sm italic">
                      "{offer.message}"
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-gray-500 text-xs">
                      {new Date(offer.createdAt).toLocaleDateString('tr-TR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>

                    {/* Actions */}
                    {offer.status === 'pending' && (
                      <div className="flex gap-2">
                        {activeTab === 'received' ? (
                          <>
                            <button
                              onClick={() => handleAccept(offer.id)}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors"
                            >
                              Kabul Et
                            </button>
                            <button
                              onClick={() => handleReject(offer.id)}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition-colors"
                            >
                              Reddet
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleCancel(offer.id)}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
                          >
                            İptal Et
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
