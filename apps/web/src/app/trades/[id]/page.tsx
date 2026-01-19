'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowsRightLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  TruckIcon,
  ExclamationTriangleIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
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
  initiatorId: string;
  initiatorName: string;
  receiverId: string;
  receiverName: string;
  initiatorItems: TradeItem[];
  receiverItems: TradeItem[];
  cashAmount?: number;
  cashPayerId?: string;
  initiatorMessage?: string;
  receiverMessage?: string;
  responseDeadline?: string;
  paymentDeadline?: string;
  shippingDeadline?: string;
  initiatorShipment?: {
    carrier: string;
    trackingNumber: string;
    status: string;
  };
  receiverShipment?: {
    carrier: string;
    trackingNumber: string;
    status: string;
  };
  createdAt: string;
  acceptedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; description: string }> = {
  pending: { 
    label: 'Bekliyor', 
    color: 'bg-yellow-100 text-yellow-700 border-yellow-300', 
    icon: ClockIcon,
    description: 'Teklif alıcı tarafından değerlendiriliyor'
  },
  accepted: { 
    label: 'Kabul Edildi', 
    color: 'bg-orange-100 text-orange-700 border-orange-300', 
    icon: CheckCircleIcon,
    description: 'Takas kabul edildi, gönderim bekleniyor'
  },
  rejected: { 
    label: 'Reddedildi', 
    color: 'bg-red-100 text-red-700 border-red-300', 
    icon: XCircleIcon,
    description: 'Teklif reddedildi'
  },
  initiator_shipped: { 
    label: 'Gönderildi', 
    color: 'bg-purple-100 text-purple-700 border-purple-300', 
    icon: TruckIcon,
    description: 'Başlatıcı ürünlerini gönderdi'
  },
  receiver_shipped: { 
    label: 'Gönderildi', 
    color: 'bg-purple-100 text-purple-700 border-purple-300', 
    icon: TruckIcon,
    description: 'Alıcı ürünlerini gönderdi'
  },
  both_shipped: { 
    label: 'Her İki Taraf Gönderdi', 
    color: 'bg-indigo-100 text-indigo-700 border-indigo-300', 
    icon: TruckIcon,
    description: 'Her iki taraf da ürünlerini gönderdi'
  },
  initiator_received: { 
    label: 'Teslim Alındı', 
    color: 'bg-green-100 text-green-700 border-green-300', 
    icon: CheckCircleIcon,
    description: 'Başlatıcı ürünleri teslim aldı'
  },
  receiver_received: { 
    label: 'Teslim Alındı', 
    color: 'bg-green-100 text-green-700 border-green-300', 
    icon: CheckCircleIcon,
    description: 'Alıcı ürünleri teslim aldı'
  },
  completed: { 
    label: 'Tamamlandı', 
    color: 'bg-green-100 text-green-700 border-green-300', 
    icon: CheckCircleIcon,
    description: 'Takas başarıyla tamamlandı'
  },
  cancelled: { 
    label: 'İptal Edildi', 
    color: 'bg-gray-100 text-gray-700 border-gray-300', 
    icon: XCircleIcon,
    description: 'Takas iptal edildi'
  },
  disputed: { 
    label: 'İtiraz Açıldı', 
    color: 'bg-orange-100 text-orange-700 border-orange-300', 
    icon: ExclamationTriangleIcon,
    description: 'Takas için itiraz açıldı'
  },
};

export default function TradeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const tradeId = params.id as string;

  const [trade, setTrade] = useState<Trade | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [countdown, setCountdown] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error('Takas detaylarını görmek için giriş yapmalısınız');
      router.push(`/login?redirect=/trades/${tradeId}`);
      return;
    }

    fetchTrade();
  }, [tradeId, isAuthenticated]);

  // Countdown timer effect
  useEffect(() => {
    if (!trade) return;

    // Determine which deadline to show based on status
    let deadline: string | undefined;
    let deadlineLabel: string = '';

    if (trade.status === 'pending' && trade.responseDeadline) {
      deadline = trade.responseDeadline;
      deadlineLabel = 'Yanıt Süresi';
    } else if (trade.status === 'accepted' && trade.paymentDeadline) {
      deadline = trade.paymentDeadline;
      deadlineLabel = 'Ödeme Süresi';
    } else if (['initiator_shipped', 'receiver_shipped', 'accepted'].includes(trade.status) && trade.shippingDeadline) {
      deadline = trade.shippingDeadline;
      deadlineLabel = 'Kargo Süresi';
    }

    if (!deadline) {
      setCountdown(null);
      return;
    }

    const calculateCountdown = () => {
      const now = new Date().getTime();
      const deadlineTime = new Date(deadline!).getTime();
      const diff = deadlineTime - now;

      if (diff <= 0) {
        setCountdown(`${deadlineLabel}: Süre Doldu!`);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      let timeStr = '';
      if (days > 0) timeStr += `${days}g `;
      timeStr += `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

      setCountdown(`${deadlineLabel}: ${timeStr}`);
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);

    return () => clearInterval(interval);
  }, [trade]);

  const fetchTrade = async () => {
    setIsLoading(true);
    try {
      const response = await tradesApi.getOne(tradeId);
      setTrade(response.data.trade || response.data);
    } catch (error: any) {
      console.error('Failed to fetch trade:', error);
      toast.error(error.response?.data?.message || 'Takas yüklenemedi');
      router.push('/trades');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!trade) return;
    
    setIsActionLoading(true);
    try {
      await tradesApi.accept(trade.id, 'Takas teklifini kabul ediyorum');
      toast.success('Takas kabul edildi!');
      fetchTrade();
    } catch (error: any) {
      console.error('Failed to accept trade:', error);
      toast.error(error.response?.data?.message || 'Takas kabul edilemedi');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!trade || !rejectReason.trim()) {
      toast.error('Lütfen red nedeni belirtin');
      return;
    }

    setIsActionLoading(true);
    try {
      await tradesApi.reject(trade.id, rejectReason);
      toast.success('Takas reddedildi');
      setShowRejectModal(false);
      setRejectReason('');
      fetchTrade();
    } catch (error: any) {
      console.error('Failed to reject trade:', error);
      toast.error(error.response?.data?.message || 'Takas reddedilemedi');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!trade) return;

    if (!confirm('Bu takası iptal etmek istediğinizden emin misiniz?')) {
      return;
    }

    setIsActionLoading(true);
    try {
      await tradesApi.cancel(trade.id, 'Kullanıcı tarafından iptal edildi');
      toast.success('Takas iptal edildi');
      fetchTrade();
    } catch (error: any) {
      console.error('Failed to cancel trade:', error);
      toast.error(error.response?.data?.message || 'Takas iptal edilemedi');
    } finally {
      setIsActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="card p-6">
              <div className="h-64 bg-gray-200 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="card p-6 text-center">
            <p className="text-gray-600">Takas bulunamadı</p>
            <Link href="/trades" className="btn-primary mt-4 inline-block">
              Takaslara Dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[trade.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;
  const isInitiator = user?.id === trade.initiatorId;
  const isReceiver = user?.id === trade.receiverId;
  const canAccept = isReceiver && trade.status === 'pending';
  const canReject = isReceiver && trade.status === 'pending';
  const canCancel = (isInitiator || isReceiver) && 
    ['pending', 'accepted', 'initiator_shipped', 'receiver_shipped'].includes(trade.status);

  const getItemImage = (item: TradeItem) => {
    return item.productImage || 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';
  };

  const calculateTotalValue = (items: TradeItem[]) => {
    return items.reduce((sum, item) => sum + item.valueAtTrade * item.quantity, 0);
  };

  const initiatorTotal = calculateTotalValue(trade.initiatorItems);
  const receiverTotal = calculateTotalValue(trade.receiverItems);
  const valueDifference = receiverTotal - initiatorTotal;

  // Kullanıcı perspektifinden ürünleri ayarla
  const myItems = isInitiator ? trade.initiatorItems : trade.receiverItems;
  const theirItems = isInitiator ? trade.receiverItems : trade.initiatorItems;
  const theirName = isInitiator ? trade.receiverName : trade.initiatorName;
  const myTotal = isInitiator ? initiatorTotal : receiverTotal;
  const theirTotal = isInitiator ? receiverTotal : initiatorTotal;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/trades" className="text-primary-500 hover:text-primary-600 mb-4 inline-block">
            ← Takaslara Dön
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Takas Detayı</h1>
              <p className="text-gray-600 mt-1">Takas No: {trade.tradeNumber}</p>
            </div>
            <div className={`px-4 py-2 rounded-lg border-2 flex items-center gap-2 ${statusConfig.color}`}>
              <StatusIcon className="w-5 h-5" />
              <span className="font-semibold">{statusConfig.label}</span>
            </div>
          </div>
        </div>

        {/* Status Description */}
        <div className="card p-4 mb-6 bg-orange-50 border-orange-200">
          <p className="text-sm text-orange-800">{statusConfig.description}</p>
        </div>

        {/* Countdown Timer */}
        {countdown && (
          <div className="card p-4 mb-6 bg-orange-50 border-orange-200">
            <div className="flex items-center gap-3">
              <ClockIcon className="w-6 h-6 text-orange-600" />
              <div>
                <p className="font-semibold text-orange-800 text-lg font-mono">{countdown}</p>
                <p className="text-sm text-orange-600">Lütfen süre dolmadan işleminizi tamamlayın</p>
              </div>
            </div>
          </div>
        )}

        {/* Trade Items Comparison */}
        <div className="flex flex-col lg:flex-row items-stretch gap-6 mb-6">
          {/* SOL - Karşı Tarafın Ürünü */}
          <div className="card p-6 flex-1">
            <h2 className="text-xl font-semibold mb-4">{theirName}'in Ürünü</h2>
            <div className="space-y-3 mb-4 max-h-[280px] overflow-y-auto">
              {theirItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/listings/${item.productId}`}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                    <Image
                      src={getItemImage(item)}
                      alt={item.productTitle}
                      fill
                      className="object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/f3f4f6/9ca3af?text=%C3%9Cr%C3%BCn';
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{item.productTitle}</p>
                    <p className="text-sm text-gray-500">
                      {item.quantity}x • ₺{item.valueAtTrade.toLocaleString('tr-TR')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-600">Toplam Değer</p>
              <p className="text-2xl font-bold text-gray-900">
                ₺{theirTotal.toLocaleString('tr-TR')}
              </p>
            </div>
          </div>

          {/* ORTA - Takas İkonu */}
          <div className="flex items-center justify-center py-4 lg:py-0">
            <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center">
              <ArrowsRightLeftIcon className="w-8 h-8 text-primary-600" />
            </div>
          </div>

          {/* SAĞ - Benim Teklifim */}
          <div className="card p-6 flex-1">
            <h2 className="text-xl font-semibold mb-4">Sizin Teklifiniz</h2>
            <div className="space-y-3 mb-4 max-h-[280px] overflow-y-auto">
              {myItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/listings/${item.productId}`}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                    <Image
                      src={getItemImage(item)}
                      alt={item.productTitle}
                      fill
                      className="object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://placehold.co/64x64/f3f4f6/9ca3af?text=%C3%9Cr%C3%BCn';
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{item.productTitle}</p>
                    <p className="text-sm text-gray-500">
                      {item.quantity}x • ₺{item.valueAtTrade.toLocaleString('tr-TR')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-600">Toplam Değer</p>
              <p className="text-2xl font-bold text-gray-900">
                ₺{myTotal.toLocaleString('tr-TR')}
              </p>
            </div>
          </div>
        </div>

        {/* Value Difference & Cash */}
        {trade.cashAmount && trade.cashAmount > 0 && (
          <div className="card p-6 mb-6 bg-green-50 border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Nakit Fark</p>
                <p className="text-2xl font-bold text-green-700">
                  ₺{Math.abs(trade.cashAmount).toLocaleString('tr-TR')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">
                  {trade.cashPayerId === trade.initiatorId 
                    ? `${trade.initiatorName} ödeyecek`
                    : `${trade.receiverName} ödeyecek`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {(trade.initiatorMessage || trade.receiverMessage) && (
          <div className="card p-6 mb-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <ChatBubbleLeftRightIcon className="w-5 h-5" />
              Mesajlar
            </h3>
            <div className="space-y-4">
              {trade.initiatorMessage && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {trade.initiatorName}:
                  </p>
                  <p className="text-gray-600">{trade.initiatorMessage}</p>
                </div>
              )}
              {trade.receiverMessage && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {trade.receiverName}:
                  </p>
                  <p className="text-gray-600">{trade.receiverMessage}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Shipment Info */}
        {(trade.initiatorShipment || trade.receiverShipment) && (
          <div className="card p-6 mb-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TruckIcon className="w-5 h-5" />
              Kargo Bilgileri
            </h3>
            <div className="space-y-4">
              {trade.initiatorShipment && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {trade.initiatorName}:
                  </p>
                  <p className="text-gray-600">
                    {trade.initiatorShipment.carrier} - {trade.initiatorShipment.trackingNumber}
                  </p>
                </div>
              )}
              {trade.receiverShipment && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {trade.receiverName}:
                  </p>
                  <p className="text-gray-600">
                    {trade.receiverShipment.carrier} - {trade.receiverShipment.trackingNumber}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {(canAccept || canReject || canCancel) && (
          <div className="card p-6">
            <div className="flex flex-wrap gap-3">
              {canAccept && (
                <button
                  onClick={handleAccept}
                  disabled={isActionLoading}
                  className="btn-primary flex-1 min-w-[120px]"
                >
                  {isActionLoading ? 'İşleniyor...' : 'Kabul Et'}
                </button>
              )}
              {canReject && (
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={isActionLoading}
                  className="btn-secondary flex-1 min-w-[120px]"
                >
                  Reddet
                </button>
              )}
              {canCancel && (
                <button
                  onClick={handleCancel}
                  disabled={isActionLoading}
                  className="btn-secondary flex-1 min-w-[120px]"
                >
                  İptal Et
                </button>
              )}
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">Takası Reddet</h2>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Red nedeni (opsiyonel)"
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRejectModal(false);
                    setRejectReason('');
                  }}
                  className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleReject}
                  disabled={isActionLoading}
                  className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isActionLoading ? 'Reddediliyor...' : 'Reddet'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
