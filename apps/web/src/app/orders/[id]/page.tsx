'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { api, paymentsApi } from '@/lib/api';
import { ArrowLeftIcon, TruckIcon, MapPinIcon, CreditCardIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@/i18n/LanguageContext';

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  amount: number;
  commissionAmount: number;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    title: string;
    imageUrl?: string;
    status: string;
  } | null;
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
  buyer: {
    id: string;
    displayName: string;
    isVerified?: boolean;
  };
  seller: {
    id: string;
    displayName: string;
    isVerified?: boolean;
  };
  shippingAddress?: {
    id: string;
    title: string;
    addressLine1: string;
    addressLine2?: string;
    district: string;
    city: string;
    postalCode: string;
  };
  shipment?: {
    id: string;
    provider: string;
    trackingNumber: string;
    status: string;
    cost?: number;
  };
  isBuyer: boolean;
  isSeller: boolean;
  payment?: {
    id: string;
    status: string;
    amount: number;
    provider: string;
  };
}

const getStatusLabels = (locale: string): Record<string, { label: string; color: string; bg: string }> => ({
  pending_payment: { label: locale === 'en' ? 'Awaiting Payment' : 'Ödeme Bekleniyor', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  paid: { label: locale === 'en' ? 'Paid' : 'Ödendi', color: 'text-green-600', bg: 'bg-green-100' },
  preparing: { label: locale === 'en' ? 'Preparing' : 'Hazırlanıyor', color: 'text-orange-600', bg: 'bg-orange-100' },
  shipped: { label: locale === 'en' ? 'Shipped' : 'Kargoya Verildi', color: 'text-purple-600', bg: 'bg-purple-100' },
  delivered: { label: locale === 'en' ? 'Delivered' : 'Teslim Edildi', color: 'text-green-600', bg: 'bg-green-100' },
  completed: { label: locale === 'en' ? 'Completed' : 'Tamamlandı', color: 'text-green-600', bg: 'bg-green-100' },
  cancelled: { label: locale === 'en' ? 'Cancelled' : 'İptal Edildi', color: 'text-red-600', bg: 'bg-red-100' },
  refund_requested: { label: locale === 'en' ? 'Refund Requested' : 'İade Talebi', color: 'text-orange-600', bg: 'bg-orange-100' },
  refunded: { label: locale === 'en' ? 'Refunded' : 'İade Edildi', color: 'text-gray-600', bg: 'bg-gray-100' },
});

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, user } = useAuthStore();
  const { t, locale } = useTranslation();
  const statusLabels = getStatusLabels(locale);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState<number | undefined>(undefined);
  const [processingRefund, setProcessingRefund] = useState(false);

  const orderId = params?.id as string;

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (orderId) {
      loadOrder();
    }
  }, [isAuthenticated, orderId]);

  const loadOrder = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/orders/${orderId}`);
      setOrder(response.data);
    } catch (error: any) {
      console.error('Order load error:', error);
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to load order' : 'Sipariş yüklenemedi'));
      router.push('/orders');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status: newStatus });
      toast.success(locale === 'en' ? 'Order status updated' : 'Sipariş durumu güncellendi');
      loadOrder();
    } catch (error: any) {
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to update status' : 'Durum güncellenemedi'));
    }
  };

  const handleRefund = async () => {
    if (!order?.payment) {
      toast.error(locale === 'en' ? 'Payment information not found' : 'Ödeme bilgisi bulunamadı');
      return;
    }

    setProcessingRefund(true);
    try {
      await paymentsApi.refund(order.id, refundAmount);
      toast.success(locale === 'en' ? 'Refund process started' : 'İade işlemi başlatıldı');
      setShowRefundModal(false);
      setRefundAmount(undefined);
      loadOrder();
    } catch (error: any) {
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to start refund' : 'İade işlemi başlatılamadı'));
    } finally {
      setProcessingRefund(false);
    }
  };

  if (!isAuthenticated || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Sipariş bulunamadı</p>
      </div>
    );
  }

  const status = statusLabels[order.status] || { label: order.status, color: 'text-gray-600', bg: 'bg-gray-100' };
  const orderAmount = Number(order.totalAmount) || Number(order.amount) || 0;
  const productInfo = order.product || order.items?.[0]?.product;
  const productImage = productInfo?.imageUrl || order.items?.[0]?.product?.imageUrl;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/orders" className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Sipariş #{order.orderNumber}</h1>
            <p className="text-sm text-gray-500">
              {new Date(order.createdAt).toLocaleDateString('tr-TR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          <span className={`px-4 py-2 rounded-full font-medium ${status.color} ${status.bg}`}>
            {status.label}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Product Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{locale === 'en' ? 'Product Information' : 'Ürün Bilgileri'}</h2>
              <div className="flex gap-4">
                <div className="w-24 h-24 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {productImage ? (
                    <img
                      src={productImage}
                      alt={productInfo?.title || (locale === 'en' ? 'Product' : 'Ürün')}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-3xl">🚗</div>
                  )}
                </div>
                <div className="flex-1">
                  <Link
                    href={`/listings/${productInfo?.id}`}
                    className="text-lg font-medium text-gray-900 hover:text-primary-500 transition-colors"
                  >
                    {productInfo?.title || (locale === 'en' ? 'Product' : 'Ürün')}
                  </Link>
                  <p className="text-sm text-gray-500 mt-1">{locale === 'en' ? 'Quantity: 1' : 'Adet: 1'}</p>
                  <p className="text-xl font-bold text-primary-500 mt-2">
                    {orderAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                  </p>
                </div>
              </div>
            </div>

            {/* Shipping Info */}
            {order.shipment && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TruckIcon className="w-5 h-5" />
                  {locale === 'en' ? 'Shipping Information' : 'Kargo Bilgileri'}
                </h2>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{locale === 'en' ? 'Carrier:' : 'Kargo Firması:'}</span>
                    <span className="font-medium">{order.shipment.provider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{locale === 'en' ? 'Tracking Number:' : 'Takip Numarası:'}</span>
                    <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                      {order.shipment.trackingNumber}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{locale === 'en' ? 'Shipping Status:' : 'Kargo Durumu:'}</span>
                    <span className="font-medium">{order.shipment.status}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Shipping Address */}
            {order.shippingAddress && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <MapPinIcon className="w-5 h-5" />
                  Teslimat Adresi
                </h2>
                <div className="text-gray-700">
                  <p className="font-medium">{order.shippingAddress.title}</p>
                  <p>{order.shippingAddress.addressLine1}</p>
                  {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
                  <p>
                    {order.shippingAddress.district}, {order.shippingAddress.city}{' '}
                    {order.shippingAddress.postalCode}
                  </p>
                </div>
              </div>
            )}

            {/* Actions for Seller */}
            {order.isSeller && order.status === 'paid' && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{locale === 'en' ? 'Seller Actions' : 'Satıcı İşlemleri'}</h2>
                <button
                  onClick={() => handleUpdateStatus('preparing')}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-medium transition-colors"
                >
                  {locale === 'en' ? 'Mark as Preparing' : 'Hazırlanıyor Olarak İşaretle'}
                </button>
              </div>
            )}

            {order.isSeller && order.status === 'preparing' && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{locale === 'en' ? 'Enter Shipping Info' : 'Kargo Bilgisi Gir'}</h2>
                <p className="text-gray-600 mb-4">
                  {locale === 'en' ? 'Please enter tracking number when shipped.' : 'Kargoya verdiğinizde takip numarasını girmeniz gerekmektedir.'}
                </p>
                <button
                  onClick={() => toast.info(locale === 'en' ? 'Shipping info feature is under development...' : 'Kargo bilgisi girme özelliği geliştiriliyor...')}
                  className="w-full bg-purple-500 hover:bg-purple-600 text-white py-3 rounded-lg font-medium transition-colors"
                >
                  {locale === 'en' ? 'Enter Shipping Info' : 'Kargo Bilgisi Gir'}
                </button>
              </div>
            )}

            {/* Actions for Buyer */}
            {order.isBuyer && order.status === 'delivered' && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{locale === 'en' ? 'Delivery Confirmation' : 'Teslimat Onayı'}</h2>
                <button
                  onClick={() => handleUpdateStatus('completed')}
                  className="w-full bg-green-500 hover:bg-green-600 text-white py-3 rounded-lg font-medium transition-colors"
                >
                  {locale === 'en' ? 'Received - Complete Order' : 'Teslim Aldım - Siparişi Tamamla'}
                </button>
              </div>
            )}

            {/* Refund Button for Completed Payments */}
            {order.payment && order.payment.status === 'completed' && (order.isBuyer || order.isSeller) && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{locale === 'en' ? 'Refund' : 'İade İşlemi'}</h2>
                <p className="text-sm text-gray-600 mb-4">
                  {locale === 'en' ? 'Payment completed. You can start a refund if needed.' : 'Ödeme tamamlandı. Gerekirse iade işlemi başlatabilirsiniz.'}
                </p>
                <button
                  onClick={() => {
                    setRefundAmount(undefined);
                    setShowRefundModal(true);
                  }}
                  className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowUturnLeftIcon className="w-5 h-5" />
                  {locale === 'en' ? 'Request Refund' : 'İade Talebi Oluştur'}
                </button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Order Summary */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5" />
                {locale === 'en' ? 'Order Summary' : 'Sipariş Özeti'}
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between text-gray-600">
                  <span>{locale === 'en' ? 'Product Amount' : 'Ürün Tutarı'}</span>
                  <span>₺{orderAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>{locale === 'en' ? 'Shipping' : 'Kargo'}</span>
                  <span>{locale === 'en' ? 'Free' : 'Ücretsiz'}</span>
                </div>
                <div className="border-t pt-3 flex justify-between font-semibold text-lg">
                  <span>{locale === 'en' ? 'Total' : 'Toplam'}</span>
                  <span className="text-primary-500">
                    {orderAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
                  </span>
                </div>
              </div>
            </div>

            {/* Buyer/Seller Info */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {order.isBuyer ? (locale === 'en' ? 'Seller' : 'Satıcı') : (locale === 'en' ? 'Buyer' : 'Alıcı')}
              </h2>
              <Link
                href={`/seller/${order.isBuyer ? order.seller.id : order.buyer.id}`}
                className="flex items-center gap-3 hover:bg-gray-50 -mx-2 px-2 py-2 rounded-lg transition-colors"
              >
                <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="text-primary-600 font-semibold text-lg">
                    {(order.isBuyer ? order.seller.displayName : order.buyer.displayName)?.[0]?.toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {order.isBuyer ? order.seller.displayName : order.buyer.displayName}
                  </p>
                  <p className="text-sm text-gray-500">{locale === 'en' ? 'View Profile' : 'Profili Gör'}</p>
                </div>
              </Link>
            </div>

            {/* Invoice Section - Show only for paid orders */}
            {order.status !== 'pending_payment' && order.status !== 'cancelled' && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {locale === 'en' ? 'Invoice' : 'Fatura'}
                </h2>
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                  <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm text-green-800">
                    {locale === 'en' 
                      ? 'Your invoice has been sent to your email address after the payment was completed.'
                      : 'Faturanız ödeme tamamlandıktan sonra e-posta adresinize gönderildi.'}
                  </p>
                </div>
              </div>
            )}

            {/* Help */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{locale === 'en' ? 'Help' : 'Yardım'}</h2>
              <div className="space-y-2">
                <button className="w-full text-left px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                  {locale === 'en' ? 'Report Order Issue' : 'Sipariş Sorunu Bildir'}
                </button>
                <button className="w-full text-left px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                  {locale === 'en' ? 'Request Refund' : 'İade Talebi Oluştur'}
                </button>
                <Link
                  href="/support"
                  className="block w-full text-left px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  {locale === 'en' ? 'Contact Support' : 'Destek ile İletişime Geç'}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Refund Modal */}
        {showRefundModal && order?.payment && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{locale === 'en' ? 'Refund' : 'İade İşlemi'}</h2>
              <p className="text-gray-600 mb-4">
                {locale === 'en' ? 'Total payment amount:' : 'Toplam ödeme tutarı:'} {order.payment.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'Refund Amount (Leave empty for full refund)' : 'İade Tutarı (Boş bırakırsanız tam iade yapılır)'}
                </label>
                <input
                  type="number"
                  min="0.01"
                  max={order.payment.amount}
                  step="0.01"
                  value={refundAmount || ''}
                  onChange={(e) => setRefundAmount(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder={locale === 'en' ? 'Refund amount (optional)' : 'İade tutarı (opsiyonel)'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRefundModal(false);
                    setRefundAmount(undefined);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={processingRefund}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleRefund}
                  disabled={processingRefund}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingRefund ? (locale === 'en' ? 'Processing...' : 'İşleniyor...') : (locale === 'en' ? 'Refund' : 'İade Et')}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
