'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import OptimizedImage from '@/components/OptimizedImage';
import { ArrowsRightLeftIcon, ClockIcon, CheckCircleIcon, XCircleIcon, TruckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { useTranslation } from '@/i18n';
import { formatTradeStatus } from '@/lib/format';
import { Button, StatusBadge, tradeStatusConfig } from '@tarodan/ui';

interface TradeItem {
  id: string;
  productId: string;
  productTitle: string;
  productImage?: string;
  productImages?: { cardUrl?: string; detailUrl?: string }[];
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
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();

  const tradeStatusLabels: Record<string, string> = {
    pending: t('trade.statusPending'),
    accepted: t('trade.statusAccepted'),
    rejected: t('trade.statusRejected'),
    initiator_shipped: locale === 'en' ? 'Initiator Shipped' : 'Gönderen Kargoda',
    receiver_shipped: locale === 'en' ? 'Receiver Shipped' : 'Alıcı Kargoda',
    both_shipped: locale === 'en' ? 'Both Shipped' : 'Her İkisi Kargoda',
    initiator_received: locale === 'en' ? 'Initiator Received' : 'Gönderen Teslim Aldı',
    receiver_received: locale === 'en' ? 'Receiver Received' : 'Alıcı Teslim Aldı',
    completed: t('trade.statusCompleted'),
    cancelled: t('trade.statusCancelled'),
    disputed: locale === 'en' ? 'Disputed' : 'Anlaşmazlık',
  };
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/trades');
    }
  }, [isAuthenticated, authLoading, router]);

  const tradesQuery = useQuery({
    queryKey: ['trades', statusFilter],
    queryFn: async (): Promise<Trade[]> => {
      const params: Record<string, string> = { pageSize: '100' };
      if (statusFilter && statusFilter !== 'shipped') {
        params.status = statusFilter;
      }
      const response = await api.get('/trades', { params });
      let trades = response.data.data || response.data.trades || [];
      // Client-side grouping for 'shipped' since it spans multiple statuses
      if (statusFilter === 'shipped') {
        trades = trades.filter((trade: Trade) =>
          ['initiator_shipped', 'receiver_shipped', 'both_shipped'].includes(trade.status)
        );
      }
      return trades;
    },
    enabled: !authLoading && isAuthenticated,
    meta: { page: 'trades' },
  });
  const trades = tradesQuery.data ?? [];
  const isLoading = tradesQuery.isLoading;

  const getStatusBadge = (status: string) => {
    return (
      <StatusBadge
        status={status}
        config={tradeStatusConfig}
        label={tradeStatusLabels[status] || formatTradeStatus(status, locale)}
      />
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-border-subtle rounded w-1/3" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-border-subtle rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface py-4 sm:py-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-heading flex items-center gap-2 sm:gap-3">
            <ArrowsRightLeftIcon className="w-6 h-6 sm:w-8 sm:h-8 text-primary-500" />
            {t('trade.myTrades')}
          </h1>
        </div>

        {/* Status Filters */}
        <div className="flex gap-1.5 sm:gap-2 mb-4 sm:mb-6 flex-wrap">
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
              <Button variant="secondary" key={f.value || 'all'}
                onClick={() => setStatusFilter(f.value)}
                className={`inline-flex items-center gap-1 sm:gap-2 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded text-xs sm:text-sm font-medium transition-colors ${statusFilter === f.value
                    ? 'bg-primary-500 text-inverted'
                    : 'bg-surface-elevated text-body hover:bg-surface-alt border border-border'
                  }`}>
                {Icon && <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                {f.label}
              </Button>
            );
          })}
        </div>

        {/* Trades List */}
        {trades.length === 0 ? (
          <div className="bg-surface-elevated rounded p-12 text-center border border-border">
            <ArrowsRightLeftIcon className="w-16 h-16 mx-auto text-border-strong mb-4" />
            <h2 className="text-xl font-semibold text-heading mb-2">
              {t('trade.noTrades')}
            </h2>
            <p className="text-muted mb-6">
              {isAuthenticated ? t('trade.noTradesHint') : t('trade.tradeRequiresLogin')}
            </p>
            <Link
              href="/listings"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-inverted rounded font-medium transition-colors"
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
                const url = item.productImages?.[0]?.cardUrl ?? item.productImages?.[0]?.detailUrl ?? item.productImage;
                return url || 'https://placehold.co/120x120/f3f4f6/9ca3af?text=Ürün';
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
                  className="block bg-surface-elevated rounded p-6 border border-border hover:border-primary-300 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex-1">
                      <p className="text-xs text-muted mb-1 font-mono">
                        #{trade.tradeNumber}
                      </p>
                      <p className="font-semibold text-heading text-lg">
                        {isSent ? t('trade.sentTrades') : t('trade.receivedTrades')} • {otherUserName}
                      </p>
                    </div>
                    {getStatusBadge(trade.status)}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    {/* My Items */}
                    <div className="md:col-span-1">
                      <p className="text-xs font-medium text-muted mb-3 uppercase tracking-wide">
                        {t('trade.yourItems')}
                      </p>
                      <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2">
                        {myItems.map((item, idx) => (
                          <div key={item.id || idx} className="flex items-center gap-3 p-2 bg-surface rounded hover:bg-surface-alt transition-colors">
                            <div className="relative w-16 h-16 rounded overflow-hidden bg-border-subtle flex-shrink-0">
                              <OptimizedImage
                                src={getItemImage(item)}
                                alt={item.productTitle}
                                fill
                                className="object-cover"
                                fallbackSrc="https://placehold.co/64x64/f3f4f6/9ca3af?text=Ürün"
                                logContext={{ itemId: item.id, page: 'trades-list' }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-heading truncate">{item.productTitle}</p>
                              <p className="text-xs text-muted">
                                {item.quantity}x • {item.valueAtTrade.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {myItems.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs text-muted">Toplam</p>
                          <p className="text-sm font-semibold text-heading">
                            {myTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    <div className="hidden md:flex items-center justify-center">
                      <div className="w-12 h-12 rounded-sm bg-primary-100 flex items-center justify-center">
                        <ArrowsRightLeftIcon className="w-6 h-6 text-primary-600" />
                      </div>
                    </div>

                    {/* Their Items */}
                    <div className="md:col-span-1">
                      <p className="text-xs font-medium text-muted mb-3 uppercase tracking-wide">
                        {t('trade.theirItems')}
                      </p>
                      <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2">
                        {theirItems.map((item, idx) => (
                          <div key={item.id || idx} className="flex items-center gap-3 p-2 bg-surface rounded hover:bg-surface-alt transition-colors">
                            <div className="relative w-16 h-16 rounded overflow-hidden bg-border-subtle flex-shrink-0">
                              <OptimizedImage
                                src={getItemImage(item)}
                                alt={item.productTitle}
                                fill
                                className="object-cover"
                                fallbackSrc="https://placehold.co/64x64/f3f4f6/9ca3af?text=Ürün"
                                logContext={{ itemId: item.id, page: 'trades-list' }}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-heading truncate">{item.productTitle}</p>
                              <p className="text-xs text-muted">
                                {item.quantity}x • {item.valueAtTrade.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      {theirItems.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <p className="text-xs text-muted">Toplam</p>
                          <p className="text-sm font-semibold text-heading">
                            {theirTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Mobile Arrow */}
                  <div className="md:hidden flex items-center justify-center my-4">
                    <ArrowsRightLeftIcon className="w-6 h-6 text-primary-500" />
                  </div>

                  {(trade.cashAmount && trade.cashAmount > 0) && (
                    <div className="mt-4 pt-4 border-t border-border bg-primary-50 rounded p-3">
                      <p className="text-sm text-body">
                        {t('trade.cashDifference')}: <span className="font-bold text-primary-600 text-base">{Number(trade.cashAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL</span>
                      </p>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between">
                    <div className="text-sm text-muted">
                      {new Date(trade.createdAt).toLocaleDateString('tr-TR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                    <div className="text-xs text-subtle">
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
