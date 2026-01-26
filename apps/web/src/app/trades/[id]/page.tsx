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
  PlusIcon,
  TrashIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { tradesApi, listingsApi, userApi } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';

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
  version?: number;
}

const getStatusConfig = (locale: string): Record<string, { label: string; color: string; icon: any; description: string }> => ({
  pending: { 
    label: locale === 'en' ? 'Pending' : 'Bekliyor', 
    color: 'bg-yellow-100 text-yellow-700 border-yellow-300', 
    icon: ClockIcon,
    description: locale === 'en' ? 'Offer is being evaluated by the recipient' : 'Teklif alıcı tarafından değerlendiriliyor'
  },
  accepted: { 
    label: locale === 'en' ? 'Accepted' : 'Kabul Edildi', 
    color: 'bg-orange-100 text-orange-700 border-orange-300', 
    icon: CheckCircleIcon,
    description: locale === 'en' ? 'Trade accepted, awaiting shipment' : 'Takas kabul edildi, gönderim bekleniyor'
  },
  rejected: { 
    label: locale === 'en' ? 'Rejected' : 'Reddedildi', 
    color: 'bg-red-100 text-red-700 border-red-300', 
    icon: XCircleIcon,
    description: locale === 'en' ? 'Offer rejected' : 'Teklif reddedildi'
  },
  initiator_shipped: { 
    label: locale === 'en' ? 'Shipped' : 'Gönderildi', 
    color: 'bg-purple-100 text-purple-700 border-purple-300', 
    icon: TruckIcon,
    description: locale === 'en' ? 'Initiator shipped their items' : 'Başlatıcı ürünlerini gönderdi'
  },
  receiver_shipped: { 
    label: locale === 'en' ? 'Shipped' : 'Gönderildi', 
    color: 'bg-purple-100 text-purple-700 border-purple-300', 
    icon: TruckIcon,
    description: locale === 'en' ? 'Receiver shipped their items' : 'Alıcı ürünlerini gönderdi'
  },
  both_shipped: { 
    label: locale === 'en' ? 'Both Parties Shipped' : 'Her İki Taraf Gönderdi', 
    color: 'bg-indigo-100 text-indigo-700 border-indigo-300', 
    icon: TruckIcon,
    description: locale === 'en' ? 'Both parties shipped their items' : 'Her iki taraf da ürünlerini gönderdi'
  },
  initiator_received: { 
    label: locale === 'en' ? 'Received' : 'Teslim Alındı', 
    color: 'bg-green-100 text-green-700 border-green-300', 
    icon: CheckCircleIcon,
    description: locale === 'en' ? 'Initiator received the items' : 'Başlatıcı ürünleri teslim aldı'
  },
  receiver_received: { 
    label: locale === 'en' ? 'Received' : 'Teslim Alındı', 
    color: 'bg-green-100 text-green-700 border-green-300', 
    icon: CheckCircleIcon,
    description: locale === 'en' ? 'Receiver received the items' : 'Alıcı ürünleri teslim aldı'
  },
  completed: { 
    label: locale === 'en' ? 'Completed' : 'Tamamlandı', 
    color: 'bg-green-100 text-green-700 border-green-300', 
    icon: CheckCircleIcon,
    description: locale === 'en' ? 'Trade successfully completed' : 'Takas başarıyla tamamlandı'
  },
  cancelled: { 
    label: locale === 'en' ? 'Cancelled' : 'İptal Edildi', 
    color: 'bg-gray-100 text-gray-700 border-gray-300', 
    icon: XCircleIcon,
    description: locale === 'en' ? 'Trade cancelled' : 'Takas iptal edildi'
  },
  disputed: { 
    label: locale === 'en' ? 'Disputed' : 'İtiraz Açıldı', 
    color: 'bg-orange-100 text-orange-700 border-orange-300', 
    icon: ExclamationTriangleIcon,
    description: locale === 'en' ? 'Dispute opened for trade' : 'Takas için itiraz açıldı'
  },
});

export default function TradeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { t, locale } = useTranslation();
  const tradeId = params.id as string;
  const STATUS_CONFIG = getStatusConfig(locale);

  const [trade, setTrade] = useState<Trade | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [countdown, setCountdown] = useState<string | null>(null);
  const [isCounterMode, setIsCounterMode] = useState(false);
  const [counterProducts, setCounterProducts] = useState<any[]>([]);
  const [counterTargetProducts, setCounterTargetProducts] = useState<any[]>([]);
  const [selectedCounterProducts, setSelectedCounterProducts] = useState<string[]>([]);
  const [selectedCounterTargetProducts, setSelectedCounterTargetProducts] = useState<string[]>([]);
  const [counterCashAmount, setCounterCashAmount] = useState<string>('');
  const [counterCashPayer, setCounterCashPayer] = useState<'me' | 'them'>('me');
  const [counterMessage, setCounterMessage] = useState('');
  const [isLoadingCounterData, setIsLoadingCounterData] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      toast.error(locale === 'en' ? 'Please login to view trade details' : 'Takas detaylarını görmek için giriş yapmalısınız');
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
      deadlineLabel = locale === 'en' ? 'Response Time' : 'Yanıt Süresi';
    } else if (trade.status === 'accepted' && trade.paymentDeadline) {
      deadline = trade.paymentDeadline;
      deadlineLabel = locale === 'en' ? 'Payment Time' : 'Ödeme Süresi';
    } else if (['initiator_shipped', 'receiver_shipped', 'accepted'].includes(trade.status) && trade.shippingDeadline) {
      deadline = trade.shippingDeadline;
      deadlineLabel = locale === 'en' ? 'Shipping Time' : 'Kargo Süresi';
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
        setCountdown(`${deadlineLabel}: ${locale === 'en' ? 'Time Expired!' : 'Süre Doldu!'}`);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      let timeStr = '';
      if (days > 0) timeStr += `${days}${locale === 'en' ? 'd ' : 'g '}`;
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
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to load trade' : 'Takas yüklenemedi'));
      router.push('/trades');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!trade) return;
    
    setIsActionLoading(true);
    try {
      await tradesApi.accept(trade.id, locale === 'en' ? 'I accept the trade offer' : 'Takas teklifini kabul ediyorum');
      toast.success(locale === 'en' ? 'Trade accepted!' : 'Takas kabul edildi!');
      fetchTrade();
    } catch (error: any) {
      console.error('Failed to accept trade:', error);
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to accept trade' : 'Takas kabul edilemedi'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!trade) {
      return;
    }

    setIsActionLoading(true);
    try {
      await tradesApi.reject(trade.id, rejectReason.trim() || undefined);
      toast.success(locale === 'en' ? 'Trade rejected' : 'Takas reddedildi');
      setShowRejectModal(false);
      setRejectReason('');
      fetchTrade();
    } catch (error: any) {
      console.error('Failed to reject trade:', error);
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to reject trade' : 'Takas reddedilemedi'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!trade) return;

    if (!confirm(locale === 'en' ? 'Are you sure you want to cancel this trade?' : 'Bu takası iptal etmek istediğinizden emin misiniz?')) {
      return;
    }

    setIsActionLoading(true);
    try {
      await tradesApi.cancel(trade.id, locale === 'en' ? 'Cancelled by user' : 'Kullanıcı tarafından iptal edildi');
      toast.success(locale === 'en' ? 'Trade cancelled' : 'Takas iptal edildi');
      fetchTrade();
    } catch (error: any) {
      console.error('Failed to cancel trade:', error);
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to cancel trade' : 'Takas iptal edilemedi'));
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleOpenCounterModal = async () => {
    if (!trade) return;
    setIsCounterMode(true);
    setIsLoadingCounterData(true);

    try {
      // Fetch my products (for counter-offer initiator items)
      const myProductsRes = await userApi.getMyProducts();
      const myProducts = myProductsRes.data.data || myProductsRes.data.products || [];
      const tradeableProducts = myProducts.filter((p: any) => 
        p.status === 'active' && 
        p.isTradeEnabled && 
        p.id !== trade.initiatorItems[0]?.productId
      );
      setCounterProducts(tradeableProducts);

      // Fetch original initiator's products (for counter-offer receiver items)
      const originalInitiatorId = trade.initiatorId;
      
      // Get products that are currently in the trade (these should be shown and pre-selected)
      const currentTradeProductIds = trade.initiatorItems.map((item: TradeItem) => item.productId);
      
      // Create product objects from trade items (they already have id, title, image)
      const currentTradeProducts = trade.initiatorItems.map((item: TradeItem) => ({
        id: item.productId,
        title: item.productTitle,
        price: item.valueAtTrade, // Use value at trade time
        images: item.productImage ? (typeof item.productImage === 'string' ? [item.productImage] : [{ url: item.productImage }]) : [],
        status: 'reserved', // These are in a trade, so they're reserved
        isTradeEnabled: true, // They're already in a trade, so they must be trade-enabled
      }));

      // Get active and trade-enabled products (excluding ones already in current trade to avoid duplicates)
      const activeListingsRes = await listingsApi.getAll({ 
        sellerId: originalInitiatorId,
        status: 'active',
        tradeOnly: true,
        limit: 100 
      });
      const activeProducts = activeListingsRes.data.products || activeListingsRes.data.data || [];
      
      // Filter out products already in current trade
      const otherActiveProducts = activeProducts.filter((p: any) => 
        !currentTradeProductIds.includes(p.id)
      );
      
      // Combine: current trade products + other active trade-enabled products
      const allInitiatorProducts = [...currentTradeProducts, ...otherActiveProducts];
      
      // All products should be trade-enabled (current trade products are already in a trade, so include them)
      const tradeableInitiatorProducts = allInitiatorProducts.filter((p: any) => {
        const isInCurrentTrade = currentTradeProductIds.includes(p.id);
        return isInCurrentTrade || (p.isTradeEnabled && p.status === 'active');
      });
      
      setCounterTargetProducts(tradeableInitiatorProducts);

      // Pre-fill form with current trade data (swapped)
      // What receiver currently wants (initiatorItems) -> what receiver will want in counter (selectedCounterTargetProducts)
      setSelectedCounterTargetProducts(trade.initiatorItems.map((item: TradeItem) => item.productId));
      
      // What receiver currently offers (receiverItems) -> what receiver will offer in counter (selectedCounterProducts)
      // Create product objects from receiver items for the list
      const currentReceiverProducts = trade.receiverItems.map((item: TradeItem) => ({
        id: item.productId,
        title: item.productTitle,
        price: item.valueAtTrade,
        images: item.productImage ? (typeof item.productImage === 'string' ? [item.productImage] : [{ url: item.productImage }]) : [],
        status: 'reserved',
        isTradeEnabled: true,
      }));
      
      // Combine current receiver products with other available products
      const allReceiverProducts = [...currentReceiverProducts, ...tradeableProducts.filter(p => 
        !trade.receiverItems.some((item: TradeItem) => item.productId === p.id)
      )];
      setCounterProducts(allReceiverProducts);
      
      // Pre-select current receiver products
      const currentReceiverProductIds = trade.receiverItems.map((item: TradeItem) => item.productId);
      setSelectedCounterProducts(currentReceiverProductIds);

      // Pre-fill cash amount
      if (trade.cashAmount && trade.cashAmount > 0) {
        setCounterCashAmount(trade.cashAmount.toString());
        // Determine cash payer: if current cashPayerId is receiver, then receiver was paying
        // In counter, if receiver was paying, they might want to change it
        setCounterCashPayer(trade.cashPayerId === trade.receiverId ? 'me' : 'them');
      } else {
        setCounterCashAmount('');
        setCounterCashPayer('me');
      }

      setCounterMessage('');
    } catch (error: any) {
      console.error('Failed to load counter-offer data:', error);
      toast.error(locale === 'en' ? 'Failed to load products' : 'Ürünler yüklenemedi');
      setIsCounterMode(false);
    } finally {
      setIsLoadingCounterData(false);
    }
  };

  const handleExitCounterMode = () => {
    setIsCounterMode(false);
    setSelectedCounterProducts([]);
    setSelectedCounterTargetProducts([]);
    setCounterCashAmount('');
    setCounterCashPayer('me');
    setCounterMessage('');
  };

  const toggleCounterProduct = (productId: string) => {
    setSelectedCounterProducts(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      }
      return [...prev, productId];
    });
  };

  const toggleCounterTargetProduct = (productId: string) => {
    setSelectedCounterTargetProducts(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      }
      return [...prev, productId];
    });
  };

  const handleCounterSubmit = async () => {
    if (!trade) return;

    if (selectedCounterProducts.length === 0) {
      toast.error(locale === 'en' ? 'Please select at least one product to offer' : 'Lütfen en az bir ürün seçin');
      return;
    }

    if (selectedCounterTargetProducts.length === 0) {
      toast.error(locale === 'en' ? 'Please select at least one product you want' : 'Lütfen en az bir istediğiniz ürünü seçin');
      return;
    }

    // Check if counter-offer is identical to current trade
    const currentInitiatorItemIds = trade.initiatorItems.map(item => item.productId).sort();
    const currentReceiverItemIds = trade.receiverItems.map(item => item.productId).sort();
    const newInitiatorItemIds = selectedCounterProducts.sort();
    const newReceiverItemIds = selectedCounterTargetProducts.sort();
    const newCashAmount = Math.abs(parseFloat(counterCashAmount) || 0);
    const currentCashAmount = Math.abs(trade.cashAmount || 0);

    const isIdentical = 
      JSON.stringify(newInitiatorItemIds) === JSON.stringify(currentReceiverItemIds) &&
      JSON.stringify(newReceiverItemIds) === JSON.stringify(currentInitiatorItemIds) &&
      newCashAmount === currentCashAmount;

    if (isIdentical) {
      toast.error(locale === 'en' 
        ? 'This counter-offer is identical to the current trade. Please make changes before submitting.' 
        : 'Önceki teklif ile aynı. Değişiklik yapmadan karşı teklif gönderemezsiniz.');
      return;
    }

    setIsActionLoading(true);
    try {
      // Calculate cash amount: positive = initiator (receiver in counter) pays, negative = receiver (original initiator) pays
      let finalCashAmount: number | undefined = undefined;
      if (counterCashAmount && parseFloat(counterCashAmount) > 0) {
        finalCashAmount = counterCashPayer === 'me' ? parseFloat(counterCashAmount) : -parseFloat(counterCashAmount);
      }

      await tradesApi.counter(trade.id, {
        initiatorItems: selectedCounterProducts.map(id => ({ productId: id, quantity: 1 })),
        receiverItems: selectedCounterTargetProducts.map(id => ({ productId: id, quantity: 1 })),
        cashAmount: finalCashAmount,
        message: counterMessage || undefined,
      });
      toast.success(locale === 'en' ? 'Counter offer sent!' : 'Karşı teklif gönderildi!');
      setIsCounterMode(false);
      fetchTrade();
    } catch (error: any) {
      console.error('Failed to send counter offer:', error);
      const errorMessage = error.response?.data?.message || (locale === 'en' ? 'Failed to send counter offer' : 'Karşı teklif gönderilemedi');
      
      // Handle specific error for identical counter-offer
      if (errorMessage.includes('Önceki teklif ile aynı') || errorMessage.includes('identical')) {
        toast.error(locale === 'en' 
          ? 'This counter-offer is identical to the current trade. Please make changes before submitting.' 
          : 'Önceki teklif ile aynı. Değişiklik yapmadan karşı teklif gönderemezsiniz.');
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsActionLoading(false);
    }
  };

  const getProductImage = (product: any): string => {
    if (!product.images || product.images.length === 0) {
      return 'https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün';
    }
    const img = product.images[0];
    return typeof img === 'string' ? img : img.url;
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
  const canCounter = isReceiver && trade.status === 'pending' && 
    (!trade.responseDeadline || new Date(trade.responseDeadline) > new Date());

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

  // Counter-offer edit mode
  if (isCounterMode) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={handleExitCounterMode}
              className="text-primary-500 hover:text-primary-600 mb-4 inline-block"
            >
              ← {locale === 'en' ? 'Back to Trade' : 'Takasa Dön'}
            </button>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <ArrowsRightLeftIcon className="w-8 h-8 text-orange-500" />
              {locale === 'en' ? 'Counter Offer' : 'Karşı Teklif'}
            </h1>
            <p className="text-gray-600 mt-2">
              {locale === 'en' ? 'Modify the trade offer' : 'Takas teklifini değiştirin'}
            </p>
          </div>

          {isLoadingCounterData ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600">{locale === 'en' ? 'Loading products...' : 'Ürünler yükleniyor...'}</p>
            </div>
          ) : (
            <>
              {/* Products Comparison - Side by Side */}
              <div className="flex flex-col lg:flex-row items-stretch gap-6 mb-6">
                {/* SOL - İstenilen Ürünler */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 flex-1">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    {locale === 'en' ? 'Products You Want' : 'İstediğiniz Ürünler'}
                  </h2>
                  {counterTargetProducts.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-600">{locale === 'en' ? 'No products available from this seller' : 'Bu satıcıdan kullanılabilir ürün yok'}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
                      {counterTargetProducts.map((product) => {
                        const isSelected = selectedCounterTargetProducts.includes(product.id);
                        return (
                          <button
                            key={product.id}
                            onClick={() => toggleCounterTargetProduct(product.id)}
                            className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-orange-500 ring-2 ring-orange-200'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {isSelected && (
                              <div className="absolute top-2 right-2 z-10 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                                <CheckIcon className="w-4 h-4 text-white" />
                              </div>
                            )}
                            <div className="aspect-square relative bg-gray-100">
                              <Image
                                src={getProductImage(product)}
                                alt={product.title}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                            <div className="p-2 text-left">
                              <p className="text-xs font-medium text-gray-900 line-clamp-1">
                                {product.title}
                              </p>
                              <p className="text-xs font-bold text-orange-500">
                                {Number(product.price || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ORTA - Takas İkonu */}
                <div className="flex items-center justify-center py-4 lg:py-0">
                  <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center">
                    <ArrowsRightLeftIcon className="w-8 h-8 text-orange-600" />
                  </div>
                </div>

                {/* SAĞ - Benim Ürünlerim */}
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 flex-1">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">
                    {locale === 'en' ? 'Products You Offer' : 'Teklif Edeceğiniz Ürünler'}
                  </h2>
                  {counterProducts.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-600 mb-4">{locale === 'en' ? 'No products available' : 'Kullanılabilir ürün yok'}</p>
                      <Link href="/profile/listings" className="text-orange-500 hover:text-orange-600 font-medium">
                        {locale === 'en' ? 'Go to My Listings →' : 'İlanlarıma Git →'}
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 max-h-[400px] overflow-y-auto">
                      {counterProducts.map((product) => {
                        const isSelected = selectedCounterProducts.includes(product.id);
                        return (
                          <button
                            key={product.id}
                            onClick={() => toggleCounterProduct(product.id)}
                            className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                              isSelected
                                ? 'border-orange-500 ring-2 ring-orange-200'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            {isSelected && (
                              <div className="absolute top-2 right-2 z-10 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                                <CheckIcon className="w-4 h-4 text-white" />
                              </div>
                            )}
                            <div className="aspect-square relative bg-gray-100">
                              <Image
                                src={getProductImage(product)}
                                alt={product.title}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                            <div className="p-2 text-left">
                              <p className="text-xs font-medium text-gray-900 line-clamp-1">
                                {product.title}
                              </p>
                              <p className="text-xs font-bold text-orange-500">
                                {Number(product.price || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Cash Amount */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {t('trade.cashDifference')} ({t('common.optional')})
                </h2>
                <p className="text-gray-600 text-sm mb-4">
                  {locale === 'en' ? 'You can add cash to balance the trade value.' : 'Takas değerini dengelemek için nakit fark ekleyebilirsiniz.'}
                </p>
                <div className="space-y-4">
                  <div className="relative max-w-xs">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₺</span>
                    <input
                      type="number"
                      value={counterCashAmount}
                      onChange={(e) => setCounterCashAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                  {parseFloat(counterCashAmount) > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-700">
                        {locale === 'en' ? 'Who will pay the cash difference?' : 'Nakit farkı kim ödeyecek?'}
                      </p>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="counterCashPayer"
                            value="me"
                            checked={counterCashPayer === 'me'}
                            onChange={(e) => setCounterCashPayer(e.target.value as 'me' | 'them')}
                            className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="text-sm text-gray-700">
                            {locale === 'en' ? 'I will pay' : 'Ben ödeyeceğim'}
                          </span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="counterCashPayer"
                            value="them"
                            checked={counterCashPayer === 'them'}
                            onChange={(e) => setCounterCashPayer(e.target.value as 'me' | 'them')}
                            className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="text-sm text-gray-700">
                            {locale === 'en' ? 'They will pay' : 'Karşı taraf ödeyecek'}
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Message */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {t('trade.message')} ({t('common.optional')})
                </h2>
                <textarea
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                  placeholder={locale === 'en' ? 'Leave a message...' : 'Mesaj bırakın...'}
                  rows={4}
                  maxLength={500}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                />
                <p className="text-sm text-gray-500 mt-2 text-right">
                  {counterMessage.length}/500
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-4">
                <button
                  onClick={handleExitCounterMode}
                  className="flex-1 px-6 py-4 border border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCounterSubmit}
                  disabled={isActionLoading || selectedCounterProducts.length === 0 || selectedCounterTargetProducts.length === 0}
                  className="flex-1 px-6 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isActionLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {locale === 'en' ? 'Sending...' : 'Gönderiliyor...'}
                    </>
                  ) : (
                    <>
                      <ArrowsRightLeftIcon className="w-5 h-5" />
                      {locale === 'en' ? 'Send Counter Offer' : 'Karşı Teklif Gönder'}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

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
              <div className="flex items-center gap-4 mt-1">
                <p className="text-gray-600">Takas No: {trade.tradeNumber}</p>
                {trade.version && trade.version > 1 && (
                  <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                    {locale === 'en' ? `Counter-offer #${trade.version - 1}` : `Karşı Teklif #${trade.version - 1}`}
                  </span>
                )}
              </div>
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
                      {item.quantity}x • {item.valueAtTrade.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-600">Toplam Değer</p>
              <p className="text-2xl font-bold text-gray-900">
                {theirTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
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
                      {item.quantity}x • {item.valueAtTrade.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="pt-4 border-t">
              <p className="text-sm text-gray-600">Toplam Değer</p>
              <p className="text-2xl font-bold text-gray-900">
                {myTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
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
                  {Math.abs(trade.cashAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
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
        {(canAccept || canReject || canCounter) && (
          <div className="card p-6">
            <div className="flex flex-wrap gap-3">
              {canAccept && (
                <button
                  onClick={handleAccept}
                  disabled={isActionLoading}
                  className="btn-primary flex-1 min-w-[120px]"
                >
                  {isActionLoading ? (locale === 'en' ? 'Processing...' : 'İşleniyor...') : (locale === 'en' ? 'Accept' : 'Kabul Et')}
                </button>
              )}
              {canCounter && (
                <button
                  onClick={handleOpenCounterModal}
                  disabled={isActionLoading}
                  className="btn-primary flex-1 min-w-[120px] bg-orange-500 hover:bg-orange-600"
                >
                  {locale === 'en' ? 'Counter Offer' : 'Karşı Teklif'}
                </button>
              )}
              {canReject && (
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={isActionLoading}
                  className="btn-secondary flex-1 min-w-[120px]"
                >
                  {locale === 'en' ? 'Reject' : 'Reddet'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">{locale === 'en' ? 'Reject Trade' : 'Takası Reddet'}</h2>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={locale === 'en' ? 'Rejection reason (optional)' : 'Red nedeni (opsiyonel)'}
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
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleReject}
                  disabled={isActionLoading}
                  className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isActionLoading ? (locale === 'en' ? 'Rejecting...' : 'Reddediliyor...') : (locale === 'en' ? 'Reject' : 'Reddet')}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
