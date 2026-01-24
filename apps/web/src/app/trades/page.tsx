'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowsRightLeftIcon, ClockIcon, CheckCircleIcon, XCircleIcon, TruckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

interface TradeProduct {
  id: string;
  title: string;
  price: number;
  imageUrl?: string;
}

interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiatorId: string;
  receiverId: string;
  initiator: { id: string; displayName?: string };
  receiver: { id: string; displayName?: string };
  initiatorItems: Array<{ product: TradeProduct }>;
  receiverItems: Array<{ product: TradeProduct }>;
  cashAmount?: number;
  createdAt: string;
  responseDeadline: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Bekliyor', color: 'bg-yellow-100 text-yellow-800', icon: ClockIcon },
  accepted: { label: 'Kabul Edildi', color: 'bg-green-100 text-green-800', icon: CheckCircleIcon },
  rejected: { label: 'Reddedildi', color: 'bg-red-100 text-red-800', icon: XCircleIcon },
  initiator_shipped: { label: 'Gönderildi', color: 'bg-blue-100 text-blue-800', icon: TruckIcon },
  receiver_shipped: { label: 'Gönderildi', color: 'bg-blue-100 text-blue-800', icon: TruckIcon },
  both_shipped: { label: 'Karşılıklı Gönderildi', color: 'bg-blue-100 text-blue-800', icon: TruckIcon },
  completed: { label: 'Tamamlandı', color: 'bg-green-100 text-green-800', icon: CheckCircleIcon },
  cancelled: { label: 'İptal Edildi', color: 'bg-gray-100 text-gray-800', icon: XCircleIcon },
  disputed: { label: 'Anlaşmazlık', color: 'bg-red-100 text-red-800', icon: XCircleIcon },
};

export default function TradesPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'sent' | 'received'>('all');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/trades');
      return;
    }
    fetchTrades();
  }, [isAuthenticated, filter]);

  const fetchTrades = async () => {
    setIsLoading(true);
    try {
      const params = filter !== 'all' ? { type: filter } : {};
      const response = await api.get('/trades', { params });
      setTrades(response.data.data || response.data.trades || []);
    } catch (error) {
      console.error('Failed to fetch trades:', error);
      toast.error('Takaslar yüklenemedi');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
        <Icon className="w-4 h-4" />
        {config.label}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <ArrowsRightLeftIcon className="w-8 h-8 text-orange-500" />
            Takaslarım
          </h1>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {[
            { value: 'all', label: 'Tümü' },
            { value: 'sent', label: 'Gönderilen' },
            { value: 'received', label: 'Gelen' },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === f.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Trades List */}
        {trades.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <ArrowsRightLeftIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Henüz Takas Yok
            </h2>
            <p className="text-gray-600 mb-6">
              Takas teklifleri burada görünecek.
            </p>
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
            >
              İlanları Keşfet
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {trades.map((trade) => {
              const isSent = trade.initiatorId === user?.id;
              const otherUser = isSent ? trade.receiver : trade.initiator;
              const myItems = isSent ? trade.initiatorItems : trade.receiverItems;
              const theirItems = isSent ? trade.receiverItems : trade.initiatorItems;
              
              return (
                <Link
                  key={trade.id}
                  href={`/trades/${trade.id}`}
                  className="block bg-white rounded-xl p-6 border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-sm text-gray-500 mb-1">
                        #{trade.tradeNumber}
                      </p>
                      <p className="font-medium text-gray-900">
                        {isSent ? 'Gönderilen' : 'Gelen'} • {otherUser?.displayName || 'Kullanıcı'}
                      </p>
                    </div>
                    {getStatusBadge(trade.status)}
                  </div>

                  <div className="flex items-center gap-4">
                    {/* My Items */}
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 mb-2">
                        {isSent ? 'Verdiğiniz' : 'Aldığınız'}
                      </p>
                      <div className="flex gap-2">
                        {myItems.slice(0, 3).map((item, idx) => (
                          <div key={idx} className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden relative">
                            {item.product?.imageUrl && (
                              <Image
                                src={item.product.imageUrl}
                                alt={item.product.title}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            )}
                          </div>
                        ))}
                        {myItems.length > 3 && (
                          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 text-sm font-medium">
                            +{myItems.length - 3}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <ArrowsRightLeftIcon className="w-8 h-8 text-orange-500 flex-shrink-0" />

                    {/* Their Items */}
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 mb-2">
                        {isSent ? 'Aldığınız' : 'Verdiğiniz'}
                      </p>
                      <div className="flex gap-2">
                        {theirItems.slice(0, 3).map((item, idx) => (
                          <div key={idx} className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden relative">
                            {item.product?.imageUrl && (
                              <Image
                                src={item.product.imageUrl}
                                alt={item.product.title}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            )}
                          </div>
                        ))}
                        {theirItems.length > 3 && (
                          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 text-sm font-medium">
                            +{theirItems.length - 3}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {trade.cashAmount && trade.cashAmount > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-sm text-gray-600">
                        Nakit Fark: <span className="font-semibold text-orange-600">₺{Number(trade.cashAmount).toLocaleString('tr-TR')}</span>
                      </p>
                    </div>
                  )}

                  <div className="mt-4 text-sm text-gray-500">
                    {new Date(trade.createdAt).toLocaleDateString('tr-TR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
