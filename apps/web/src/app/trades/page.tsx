'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowsRightLeftIcon, ClockIcon, CheckCircleIcon, XCircleIcon, TruckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { useTranslation } from '@/i18n';

interface TradeItem {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string;
  side: string;
  quantity: number;
  valueAtTrade: number;
}

interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiatorId: string;
  receiverId: string;
  initiatorName?: string;
  receiverName?: string;
  initiator?: { id: string; displayName?: string };
  receiver?: { id: string; displayName?: string };
  initiatorItems: TradeItem[];
  receiverItems: TradeItem[];
  cashAmount?: number;
  createdAt: string;
  responseDeadline: string;
}

export default function TradesPage() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { user, isAuthenticated } = useAuthStore();
  
  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: t('trade.statusPending'), color: 'bg-yellow-100 text-yellow-800', icon: ClockIcon },
    accepted: { label: t('trade.statusAccepted'), color: 'bg-green-100 text-green-800', icon: CheckCircleIcon },
    rejected: { label: t('trade.statusRejected'), color: 'bg-red-100 text-red-800', icon: XCircleIcon },
    initiator_shipped: { label: t('order.statusShipped'), color: 'bg-blue-100 text-blue-800', icon: TruckIcon },
    receiver_shipped: { label: t('order.statusShipped'), color: 'bg-blue-100 text-blue-800', icon: TruckIcon },
    both_shipped: { label: t('order.statusShipped'), color: 'bg-blue-100 text-blue-800', icon: TruckIcon },
    completed: { label: t('trade.statusCompleted'), color: 'bg-green-100 text-green-800', icon: CheckCircleIcon },
    cancelled: { label: t('trade.statusCancelled'), color: 'bg-gray-100 text-gray-800', icon: XCircleIcon },
    disputed: { label: t('common.error'), color: 'bg-red-100 text-red-800', icon: XCircleIcon },
  };
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/trades');
      return;
    }
    fetchTrades();
  }, [isAuthenticated, statusFilter]);

  const fetchTrades = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/trades');
      let allTrades = response.data.data || response.data.trades || [];
      
      // Frontend'de status bazlı filtreleme
      if (statusFilter) {
        if (statusFilter === 'shipped') {
          // Kargoda: initiator_shipped, receiver_shipped, both_shipped
          allTrades = allTrades.filter((trade: Trade) => 
            trade.status === 'initiator_shipped' || 
            trade.status === 'receiver_shipped' || 
            trade.status === 'both_shipped'
          );
        } else {
          allTrades = allTrades.filter((trade: Trade) => trade.status === statusFilter);
        }
      }
      
      setTrades(allTrades);
    } catch (error) {
      console.error('Failed to fetch trades:', error);
      toast.error(t('trade.tradesLoadFailed'));
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
            {t('trade.myTrades')}
          </h1>
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { value: null, label: t('common.all'), icon: null },
            { value: 'pending', label: t('trade.statusPending'), icon: ClockIcon },
            { value: 'shipped', label: locale === 'en' ? 'In Transit' : 'Kargoda', icon: TruckIcon },
            { value: 'completed', label: t('trade.statusCompleted'), icon: CheckCircleIcon },
            { value: 'cancelled', label: t('trade.statusCancelled'), icon: XCircleIcon },
            { value: 'rejected', label: t('trade.statusRejected'), icon: XCircleIcon },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.value || 'all'}
                onClick={() => setStatusFilter(f.value)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Trades List */}
        {trades.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-gray-200">
            <ArrowsRightLeftIcon className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              {t('trade.noTrades')}
            </h2>
            <p className="text-gray-600 mb-6">
              {t('trade.tradeRequiresLogin')}
            </p>
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
            >
              {t('cart.browseListings')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {trades.map((trade) => {
              const isSent = trade.initiatorId === user?.id;
              const otherUserName = isSent 
                ? (trade.receiverName || trade.receiver?.displayName || t('common.name'))
                : (trade.initiatorName || trade.initiator?.displayName || t('common.name'));
              const myItems = isSent ? trade.initiatorItems : trade.receiverItems;
              const theirItems = isSent ? trade.receiverItems : trade.initiatorItems;
              
              const getItemImage = (item: TradeItem): string => {
                return item.productImage || 'https://placehold.co/120x120/f3f4f6/9ca3af?text=Ürün';
              };

              const calculateTotalValue = (items: TradeItem[]): number => {
                return items.reduce((sum, item) => sum + item.valueAtTrade * item.quantity, 0);
              };

              const myTotal = calculateTotalValue(myItems);
              const theirTotal = calculateTotalValue(theirItems);
              
              return (
                <Link
                  key={trade.id}
                  href={`/trades/${trade.id}`}
                  className="block bg-white rounded-xl p-6 border border-gray-200 hover:border-orange-300 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 mb-1 font-mono">
                        #{trade.tradeNumber}
                      </p>
                      <p className="font-semibold text-gray-900 text-lg">
                        {isSent ? t('trade.sentTrades') : t('trade.receivedTrades')} • {otherUserName}
                      </p>
                    </div>
                    {getStatusBadge(trade.status)}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {/* My Items */}
                    <div className="md:col-span-1">
                      <p className="text-xs font-medium text-gray-600 mb-3 uppercase tracking-wide">
                        {t('trade.yourItems')}
                      </p>
                      <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2">
                        {myItems.map((item, idx) => (
                          <div key={item.id || idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                              <Image
                                src={getItemImage(item)}
                                alt={item.productTitle}
                                fill
                                className="object-cover"
                                unoptimized
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/f3f4f6/9ca3af?text=Ürün';
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{item.productTitle}</p>
                              <p className="text-xs text-gray-500">
                                {item.quantity}x • {item.valueAtTrade.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {myItems.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs text-gray-500">Toplam</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {myTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    <div className="hidden md:flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                        <ArrowsRightLeftIcon className="w-6 h-6 text-orange-600" />
                      </div>
                    </div>

                    {/* Their Items */}
                    <div className="md:col-span-1">
                      <p className="text-xs font-medium text-gray-600 mb-3 uppercase tracking-wide">
                        {t('trade.theirItems')}
                      </p>
                      <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2">
                        {theirItems.map((item, idx) => (
                          <div key={item.id || idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                              <Image
                                src={getItemImage(item)}
                                alt={item.productTitle}
                                fill
                                className="object-cover"
                                unoptimized
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/f3f4f6/9ca3af?text=Ürün';
                                }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{item.productTitle}</p>
                              <p className="text-xs text-gray-500">
                                {item.quantity}x • {item.valueAtTrade.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {theirItems.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs text-gray-500">Toplam</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {theirTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mobile Arrow */}
                  <div className="md:hidden flex items-center justify-center my-4">
                    <ArrowsRightLeftIcon className="w-6 h-6 text-orange-500" />
                  </div>

                  {(trade.cashAmount && trade.cashAmount > 0) && (
                    <div className="mt-4 pt-4 border-t border-gray-200 bg-orange-50 rounded-lg p-3">
                      <p className="text-sm text-gray-700">
                        {t('trade.cashDifference')}: <span className="font-bold text-orange-600 text-base">{Number(trade.cashAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>
                      </p>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      {new Date(trade.createdAt).toLocaleDateString('tr-TR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="text-xs text-gray-400">
                      {locale === 'en' ? 'Click to view details' : 'Detayları görmek için tıklayın'}
                    </div>
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
