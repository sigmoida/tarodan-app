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
import {
  Button,
  Input,
  Spinner,
  Textarea,
  enumLabel,
  paymentProviderConfig,
  orderStatusConfig,
  paymentHoldStatusConfig,
} from '@tarodan/ui';
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
  pending: { label: 'Bekliyor', color: 'text-warning-600', bg: 'bg-warning-100' },
  processing: { label: 'İşleniyor', color: 'text-info-600', bg: 'bg-info-100' },
  completed: { label: 'Tamamlandı', color: 'text-success-600', bg: 'bg-success-100' },
  failed: { label: 'Başarısız', color: 'text-danger-600', bg: 'bg-danger-100' },
  refunded: { label: 'İade Edildi', color: 'text-muted', bg: 'bg-surface-alt' },
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
      if (process.env.NODE_ENV === 'development') console.error('Payment load error:', error);
      toast.error(error.response?.data?.message || 'Ödeme yüklenemedi');
      router.push('/payments');
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
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-muted">Ödeme bulunamadı</p>
      </div>
    );
  }

  const statusInfo = statusConfig[payment.status] || statusConfig.pending;

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/payments"
            className="p-2 hover:bg-border-subtle rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-muted" />
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-heading">Ödeme Detayı</h1>
            <p className="text-sm text-muted">
              {payment.orderNumber
                ? `Sipariş #${payment.orderNumber}`
                : `Ödeme #${payment.id?.slice(0, 8) ?? ''}`}
            </p>
          </div>
          <span className={`px-4 py-2 rounded-full font-medium ${statusInfo.color} ${statusInfo.bg}`}>
            {statusInfo.label}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Payment Info */}
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                <CreditCardIcon className="w-5 h-5" />
                Ödeme Bilgileri
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted">Ödeme ID:</span>
                  <span className="font-mono text-sm">{payment.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Tutar:</span>
                  <span className="font-semibold text-lg">
                    ₺{payment.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Para Birimi:</span>
                  <span>{payment.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Ödeme Sağlayıcı:</span>
                  <span>{enumLabel(paymentProviderConfig, payment.provider)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Transaction ID:</span>
                  <span className="font-mono text-sm">
                    {payment.providerPaymentId || payment.providerConversationId || 'N/A'}
                  </span>
                </div>
                {payment.failureReason && (
                  <div className="mt-4 p-3 bg-danger-50 border border-danger-200 rounded-lg">
                    <p className="text-sm text-danger-800">
                      <strong>Hata Nedeni:</strong> {payment.failureReason}
                    </p>
                  </div>
                )}
                <div className="flex justify-between pt-3 border-t">
                  <span className="text-muted">Oluşturulma:</span>
                  <span className="text-sm">
                    {new Date(payment.createdAt).toLocaleString('tr-TR')}
                  </span>
                </div>
                {payment.paidAt && (
                  <div className="flex justify-between">
                    <span className="text-muted">Ödeme Tarihi:</span>
                    <span className="text-sm">
                      {new Date(payment.paidAt).toLocaleString('tr-TR')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Order Info */}
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-heading mb-4">Sipariş Bilgileri</h2>
              {payment.order ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted">Sipariş No:</span>
                    <Link
                      href={`/orders/${payment.orderId}`}
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      #{payment.order.orderNumber}
                    </Link>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Ürün:</span>
                    <span>{payment.order.product?.title ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Sipariş Durumu:</span>
                    <span>{enumLabel(orderStatusConfig, payment.order.status)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Toplam Tutar:</span>
                    <span>₺{payment.order.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Komisyon:</span>
                    <span>₺{payment.order.commissionAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">
                  Bu ödeme bir siparişe bağlı değil (üyelik, grup veya takas-nakit ödemesi olabilir).
                </p>
              )}
            </div>

            {/* User Info */}
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-heading mb-4">Kullanıcı Bilgileri</h2>
              {payment.order ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted mb-1">Alıcı</p>
                    <p className="font-medium">{payment.order.buyer?.displayName ?? '—'}</p>
                    <p className="text-sm text-muted">{payment.order.buyer?.email ?? ''}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted mb-1">Satıcı</p>
                    <p className="font-medium">{payment.order.seller?.displayName ?? '—'}</p>
                    <p className="text-sm text-muted">{payment.order.seller?.email ?? ''}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Siparişe bağlı olmayan ödeme — alıcı/satıcı bilgisi yok.</p>
              )}
            </div>

            {/* Payment Holds */}
            {payment.paymentHolds && payment.paymentHolds.length > 0 && (
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-heading mb-4">Ödeme Bekletmeleri</h2>
                <div className="space-y-3">
                  {payment.paymentHolds.map((hold) => (
                    <div key={hold.id} className="p-3 bg-surface rounded-lg">
                      <div className="flex justify-between">
                        <span className="text-muted">Tutar:</span>
                        <span className="font-semibold">
                          ₺{hold.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Durum:</span>
                        <span>{enumLabel(paymentHoldStatusConfig, hold.status)}</span>
                      </div>
                      {hold.releaseAt && (
                        <div className="flex justify-between">
                          <span className="text-muted">Serbest Bırakma:</span>
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
            <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-heading mb-4">Admin İşlemleri</h2>
              <div className="space-y-3">
                {payment.status === 'completed' && (
                  <Button
                    variant="danger"
                    size="md"
                    onClick={() => {
                      setRefundAmount(undefined);
                      setRefundReason('');
                      setShowRefundModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <ArrowUturnLeftIcon className="w-5 h-5" />
                    Manuel İade
                  </Button>
                )}
                {payment.status !== 'completed' && payment.status !== 'refunded' && (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => {
                      setCancelReason('');
                      setShowCancelModal(true);
                    }}
                    className="w-full flex items-center justify-center gap-2"
                  >
                    <XCircleIcon className="w-5 h-5" />
                    Zorla İptal
                  </Button>
                )}
              </div>
            </div>

            {/* Metadata */}
            {payment.metadata && Object.keys(payment.metadata).length > 0 && (
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-heading mb-4">Metadata</h2>
                <pre className="text-xs bg-surface p-3 rounded-lg overflow-auto">
                  {JSON.stringify(payment.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Refund Modal */}
        {showRefundModal && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-heading mb-4 leading-tight">Manuel İade</h2>
              <p className="text-muted mb-4">
                Toplam ödeme tutarı: ₺{payment.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-body mb-2">
                  İade Tutarı (Boş bırakırsanız tam iade yapılır)
                </label>
                <Input type="number"
                  min="0.01"
                  max={payment.amount}
                  step="0.01"
                  value={refundAmount || ''}
                  onChange={(e) => setRefundAmount(e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="İade tutarı (opsiyonel)" />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-body mb-2">
                  İade Nedeni (Opsiyonel)
                </label>
                <Textarea value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="İade nedeni..."
                  rows={3} />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setShowRefundModal(false);
                    setRefundAmount(undefined);
                    setRefundReason('');
                  }}
                  disabled={processing}
                  className="flex-1"
                >
                  İptal
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  onClick={handleManualRefund}
                  disabled={processing}
                  isLoading={processing}
                  className="flex-1"
                >
                  {processing ? 'İşleniyor...' : 'İade Et'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold text-heading mb-4 leading-tight flex items-center gap-2">
                <ExclamationTriangleIcon className="w-6 h-6 text-primary-500" />
                Zorla İptal
              </h2>
              <p className="text-muted mb-4">
                Bu ödemeyi zorla iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-body mb-2">
                  İptal Nedeni <span className="text-danger-500">*</span>
                </label>
                <Textarea value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="İptal nedeni..."
                  rows={3}
                  required />
              </div>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancelReason('');
                  }}
                  disabled={processing}
                  className="flex-1"
                >
                  İptal
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleForceCancel}
                  disabled={processing || !cancelReason.trim()}
                  isLoading={processing}
                  className="flex-1"
                >
                  {processing ? 'İşleniyor...' : 'Zorla İptal Et'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
