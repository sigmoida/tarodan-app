'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  CreditCardIcon,
  ArrowUturnLeftIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface PaymentDetail {
  id: string;
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  failureReason?: string;
  providerPaymentId?: string;
  providerConversationId?: string;
  metadata?: any;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
    commissionAmount: number;
    buyer: {
      id: string;
      displayName: string;
      email: string;
    };
    seller: {
      id: string;
      displayName: string;
      email: string;
    };
    product: {
      id: string;
      title: string;
    };
    shippingAddress?: any;
  };
  paymentHolds?: Array<{
    id: string;
    amount: number;
    status: string;
    releaseAt?: string;
    releasedAt?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Bekliyor', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  processing: { label: 'İşleniyor', color: 'text-blue-600', bg: 'bg-blue-100' },
  completed: { label: 'Tamamlandı', color: 'text-green-600', bg: 'bg-green-100' },
  failed: { label: 'Başarısız', color: 'text-red-600', bg: 'bg-red-100' },
  refunded: { label: 'İade Edildi', color: 'text-gray-600', bg: 'bg-gray-100' },
};

export default function AdminPaymentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const paymentId = params.id as string;

  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [refundAmount, setRefundAmount] = useState<number | undefined>(undefined);
  const [refundReason, setRefundReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (paymentId) {
      loadPayment();
    }
  }, [paymentId]);

  const loadPayment = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getPayment(paymentId);
      setPayment(response.data);
    } catch (error: any) {
      console.error('Payment load error:', error);
      toast.error(error.response?.data?.message || 'Ödeme yüklenemedi');
      router.push('/admin/payments');
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefund = async () => {
    if (!payment) return;

    setProcessing(true);
    try {
      await adminApi.manualRefund(paymentId, {
        amount: refundAmount,
        reason: refundReason || undefined,
      });
      toast.success('İade işlemi başlatıldı');
      setShowRefundModal(false);
      setRefundAmount(undefined);
      setRefundReason('');
      loadPayment();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İade işlemi başlatılamadı');
    } finally {
      setProcessing(false);
    }
  };

  const handleForceCancel = async () => {
    if (!payment || !cancelReason.trim()) {
      toast.error('İptal nedeni gereklidir');
      return;
    }

    setProcessing(true);
    try {
      await adminApi.forceCancelPayment(paymentId, cancelReason);
      toast.success('Ödeme zorla iptal edildi');
      setShowCancelModal(false);
      setCancelReason('');
      loadPayment();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Ödeme iptal edilemedi');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Ödeme bulunamadı</p>
      </div>
    );
  }

  const statusInfo = statusConfig[payment.status] || statusConfig.pending;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/payments"
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">Ödeme Detayı</h1>
            <p className="text-sm text-gray-500">Sipariş #{payment.orderNumber}</p>
          </div>
          <span className={`px-4 py-2 rounded-full font-medium ${statusInfo.color} ${statusInfo.bg}`}>
            {statusInfo.label}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Payment Info */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5" />
                Ödeme Bilgileri
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Ödeme ID:</span>
                  <span className="font-mono text-sm">{payment.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tutar:</span>
                  <span className="font-semibold text-lg">
                    ₺{payment.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Para Birimi:</span>
                  <span>{payment.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Ödeme Sağlayıcı:</span>
                  <span className="uppercase">{payment.provider}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Transaction ID:</span>
                  <span className="font-mono text-sm">
                    {payment.providerPaymentId || payment.providerConversationId || 'N/A'}
                  </span>
                </div>
                {payment.failureReason && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">
                      <strong>Hata Nedeni:</strong> {payment.failureReason}
                    </p>
                  </div>
                )}
                <div className="flex justify-between pt-3 border-t">
                  <span className="text-gray-600">Oluşturulma:</span>
                  <span className="text-sm">
                    {new Date(payment.createdAt).toLocaleString('tr-TR')}
                  </span>
                </div>
                {payment.paidAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Ödeme Tarihi:</span>
                    <span className="text-sm">
                      {new Date(payment.paidAt).toLocaleString('tr-TR')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Order Info */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Sipariş Bilgileri</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Sipariş No:</span>
                  <Link
                    href={`/admin/orders/${payment.orderId}`}
                    className="text-primary-600 hover:text-primary-700 font-medium"
                  >
                    #{payment.order.orderNumber}
                  </Link>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Ürün:</span>
                  <span>{payment.order.product.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Sipariş Durumu:</span>
                  <span>{payment.order.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Toplam Tutar:</span>
                  <span>₺{payment.order.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Komisyon:</span>
                  <span>₺{payment.order.commissionAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* User Info */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Kullanıcı Bilgileri</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Alıcı</p>
                  <p className="font-medium">{payment.order.buyer.displayName}</p>
                  <p className="text-sm text-gray-500">{payment.order.buyer.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Satıcı</p>
                  <p className="font-medium">{payment.order.seller.displayName}</p>
                  <p className="text-sm text-gray-500">{payment.order.seller.email}</p>
                </div>
              </div>
            </div>

            {/* Payment Holds */}
            {payment.paymentHolds && payment.paymentHolds.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Ödeme Bekletmeleri</h2>
                <div className="space-y-3">
                  {payment.paymentHolds.map((hold) => (
                    <div key={hold.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tutar:</span>
                        <span className="font-semibold">
                          ₺{hold.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Durum:</span>
                        <span>{hold.status}</span>
                      </div>
                      {hold.releaseAt && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Serbest Bırakma:</span>
                          <span className="text-sm">
                            {new Date(hold.releaseAt).toLocaleDateString('tr-TR')}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Admin Actions */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Admin İşlemleri</h2>
              <div className="space-y-3">
                {payment.status === 'completed' && (
                  <button
                    onClick={() => {
                      setRefundAmount(undefined);
                      setRefundReason('');
                      setShowRefundModal(true);
                    }}
                    className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center justify-center gap-2"
                  >
                    <ArrowUturnLeftIcon className="w-5 h-5" />
                    Manuel İade
                  </button>
                )}
                {payment.status !== 'completed' && payment.status !== 'refunded' && (
                  <button
                    onClick={() => {
                      setCancelReason('');
                      setShowCancelModal(true);
                    }}
                    className="w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg flex items-center justify-center gap-2"
                  >
                    <XCircleIcon className="w-5 h-5" />
                    Zorla İptal
                  </button>
                )}
              </div>
            </div>

            {/* Metadata */}
            {payment.metadata && Object.keys(payment.metadata).length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Metadata</h2>
                <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-auto">
                  {JSON.stringify(payment.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Refund Modal */}
        {showRefundModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Manuel İade</h2>
              <p className="text-gray-600 mb-4">
                Toplam ödeme tutarı: ₺{payment.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  İade Tutarı (Boş bırakırsanız tam iade yapılır)
                </label>
                <input
                  type="number"
                  min="0.01"
                  max={payment.amount}
                  step="0.01"
                  value={refundAmount || ''}
                  onChange={(e) => setRefundAmount(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="İade tutarı (opsiyonel)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  İade Nedeni (Opsiyonel)
                </label>
                <textarea
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="İade nedeni..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRefundModal(false);
                    setRefundAmount(undefined);
                    setRefundReason('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={processing}
                >
                  İptal
                </button>
                <button
                  onClick={handleManualRefund}
                  disabled={processing}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'İşleniyor...' : 'İade Et'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-6 h-6 text-orange-500" />
                Zorla İptal
              </h2>
              <p className="text-gray-600 mb-4">
                Bu ödemeyi zorla iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  İptal Nedeni <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="İptal nedeni..."
                  rows={3}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancelReason('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={processing}
                >
                  İptal
                </button>
                <button
                  onClick={handleForceCancel}
                  disabled={processing || !cancelReason.trim()}
                  className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'İşleniyor...' : 'Zorla İptal Et'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
