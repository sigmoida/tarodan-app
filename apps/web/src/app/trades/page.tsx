'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowsRightLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  TruckIcon,
} from '@heroicons/react/24/outline';
import { tradesApi } from '@/lib/api';

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
  // New API format
  initiatorId?: string;
  initiatorName?: string;
  receiverId?: string;
  receiverName?: string;
  initiatorItems?: TradeItem[];
  receiverItems?: TradeItem[];
  // Old API format fallback
  initiator?: {
    id: string;
    username?: string;
    displayName?: string;
  };
  receiver?: {
    id: string;
    username?: string;
    displayName?: string;
  };
  initiator_listings?: TradeItem[];
  receiver_listings?: TradeItem[];
  // Cash fields
  cashAmount?: number;
  cash_amount?: number;
  cashPayerId?: string;
  cashDirection?: string;
  // Dates
  createdAt?: string;
  created_at?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Bekliyor', color: 'bg-yellow-100 text-yellow-700', icon: ClockIcon },
  accepted: { label: 'Kabul Edildi', color: 'bg-orange-100 text-orange-700', icon: CheckCircleIcon },
  rejected: { label: 'Reddedildi', color: 'bg-red-100 text-red-700', icon: XCircleIcon },
  initiator_shipped: { label: 'Kargo Gönderildi', color: 'bg-purple-100 text-purple-700', icon: TruckIcon },
  receiver_shipped: { label: 'Kargo Gönderildi', color: 'bg-purple-100 text-purple-700', icon: TruckIcon },
  confirmed: { label: 'Tamamlandı', color: 'bg-green-100 text-green-700', icon: CheckCircleIcon },
  cancelled: { label: 'İptal Edildi', color: 'bg-gray-100 text-gray-700', icon: XCircleIcon },
};

const FILTER_TABS = [
  { value: '', label: 'Tümü' },
  { value: 'pending', label: 'Bekleyen' },
  { value: 'accepted', label: 'Aktif' },
  { value: 'confirmed', label: 'Tamamlanan' },
];

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('');

  useEffect(() => {
    fetchTrades();
  }, [activeFilter]);

  const fetchTrades = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, any> = {};
      if (activeFilter) params.status = activeFilter;
      
      const response = await tradesApi.getAll(params);
      // Handle different response structures
      const tradesData = response.data?.trades || response.data?.data || response.data || [];
      setTrades(Array.isArray(tradesData) ? tradesData : []);
    } catch (error) {
      console.error('Failed to fetch trades:', error);
      setTrades([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Takaslarım</h1>
          <p className="text-gray-600">Takas tekliflerinizi yönetin</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className={`px-4 py-2 rounded-full font-medium transition-colors whitespace-nowrap ${
                activeFilter === tab.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Trades List */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="card p-6 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 bg-gray-200 rounded-lg" />
                  <div className="w-12 h-12 bg-gray-200 rounded-full" />
                  <div className="w-20 h-20 bg-gray-200 rounded-lg" />
                  <div className="flex-1">
                    <div className="h-5 bg-gray-200 rounded w-1/2 mb-2" />
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : trades.length === 0 ? (
          <div className="text-center py-16">
            <ArrowsRightLeftIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Henüz takas yok</h3>
            <p className="text-gray-600 mb-6">
              İlanlara göz atın ve takas teklifleri gönderin
            </p>
            <Link href="/listings" className="btn-primary">
              İlanlara Göz At
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {trades.map((trade, index) => {
              const statusConfig = STATUS_CONFIG[trade.status] || STATUS_CONFIG.pending;
              const StatusIcon = statusConfig.icon;
              
              // Handle different API response structures
              const initiatorListings = trade.initiator_listings || trade.initiatorItems || trade.offeredProducts || [];
              const receiverListings = trade.receiver_listings || trade.receiverItems || trade.requestedProducts || [];
              const initiatorUser = trade.initiator || trade.initiatorUser;
              const receiverUser = trade.receiver || trade.receiverUser;
              const cashAmount = trade.cash_amount ?? trade.cashAmount ?? 0;
              const createdAt = trade.created_at || trade.createdAt;
              
              // Helper to get item image
              const getItemImage = (item: TradeItem) => {
                if (item.productImage) return item.productImage;
                return 'https://placehold.co/64x64/f3f4f6/9ca3af?text=%C3%9Cr%C3%BCn';
              };
              
              // Helper to get item title
              const getItemTitle = (item: TradeItem) => {
                return item.productTitle || 'Ürün';
              };
              
              return (
                <motion.div
                  key={trade.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link href={`/trades/${trade.id}`}>
                    <div className="card p-6 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-4">
                        <span className={`badge ${statusConfig.color}`}>
                          <StatusIcon className="w-4 h-4 mr-1" />
                          {statusConfig.label}
                        </span>
                        <span className="text-sm text-gray-500">
                          {createdAt ? new Date(createdAt).toLocaleDateString('tr-TR') : '-'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* My Items */}
                        <div className="flex -space-x-3">
                          {initiatorListings.length > 0 ? (
                            <>
                              {initiatorListings.slice(0, 3).map((item, i) => (
                                <div
                                  key={i}
                                  className="w-16 h-16 rounded-lg overflow-hidden border-2 border-white shadow-sm bg-gray-100"
                                >
                                  <Image
                                    src={getItemImage(item)}
                                    alt={getItemTitle(item)}
                                    width={64}
                                    height={64}
                                    className="object-cover w-full h-full"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/f3f4f6/9ca3af?text=%C3%9Cr%C3%BCn';
                                    }}
                                  />
                                </div>
                              ))}
                              {initiatorListings.length > 3 && (
                                <div className="w-16 h-16 rounded-lg bg-gray-100 border-2 border-white shadow-sm flex items-center justify-center">
                                  <span className="text-sm font-medium text-gray-500">
                                    +{initiatorListings.length - 3}
                                  </span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-100 border-2 border-white shadow-sm flex items-center justify-center">
                              <span className="text-xs text-gray-400">Yok</span>
                            </div>
                          )}
                        </div>

                        {/* Swap Icon */}
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                          <ArrowsRightLeftIcon className="w-6 h-6 text-gray-500" />
                        </div>

                        {/* Their Items */}
                        <div className="flex -space-x-3">
                          {receiverListings.length > 0 ? (
                            <>
                              {receiverListings.slice(0, 3).map((item, i) => (
                                <div
                                  key={i}
                                  className="w-16 h-16 rounded-lg overflow-hidden border-2 border-white shadow-sm bg-gray-100"
                                >
                                  <Image
                                    src={getItemImage(item)}
                                    alt={getItemTitle(item)}
                                    width={64}
                                    height={64}
                                    className="object-cover w-full h-full"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/f3f4f6/9ca3af?text=%C3%9Cr%C3%BCn';
                                    }}
                                  />
                                </div>
                              ))}
                              {receiverListings.length > 3 && (
                                <div className="w-16 h-16 rounded-lg bg-gray-100 border-2 border-white shadow-sm flex items-center justify-center">
                                  <span className="text-sm font-medium text-gray-500">
                                    +{receiverListings.length - 3}
                                  </span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-100 border-2 border-white shadow-sm flex items-center justify-center">
                              <span className="text-xs text-gray-400">Yok</span>
                            </div>
                          )}
                        </div>

                        {/* Trade Info */}
                        <div className="flex-1 ml-4">
                          <p className="font-medium text-gray-900">
                            {trade.initiatorName || initiatorUser?.username || initiatorUser?.displayName || 'Kullanıcı'} ↔ {trade.receiverName || receiverUser?.username || receiverUser?.displayName || 'Kullanıcı'}
                          </p>
                          {cashAmount > 0 && (
                            <p className="text-sm text-green-600 font-medium">
                              +₺{cashAmount.toLocaleString('tr-TR')} nakit
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


