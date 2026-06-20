'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ShoppingBagIcon,
  CreditCardIcon,
  TruckIcon,
  MapPinIcon,
  ClockIcon,
  PrinterIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { cancelReasonLabel, orderOriginLabel } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Button,
  Select,
  Spinner,
  enumLabel,
  paymentStatusConfig,
  paymentProviderConfig,
  shipmentStatusConfig,
  shipmentProviderConfig,
} from '@tarodan/ui';
import { AdminFinancialSummary } from '@/components/AdminFinancialSummary';
import { colors as dsColors } from '@tarodan/ui';
import { AwaitingConfirmationCard } from '@/components/orders/AwaitingConfirmationCard';
import { ExtendConfirmationDialog } from '@/components/orders/ExtendConfirmationDialog';
import { ForceCompleteDialog } from '@/components/orders/ForceCompleteDialog';

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  commissionAmount: number;
  shippingCost: number;
  buyerFeeAmount?: number;
  sellerFeeAmount?: number;
  subtotal?: number;
  sellerNetAmount?: number;
  discountAmount?: number;
  discountCode?: string | null;
  discountBreakdown?: any;
  pricing?: {
    subtotal: number;
    shippingAmount: number;
    buyerFeeAmount: number;
    sellerFeeAmount: number;
    commissionAmount: number;
    totalAmount: number;
    sellerNetAmount: number;
    discountAmount?: number;
    discountCode?: string | null;
  };
  buyer: {
    id: string;
    displayName: string;
    email: string;
    phone?: string;
  };
  seller: {
    id: string;
    displayName: string;
    email: string;
  };
  product: {
    id: string;
    title: string;
    price: number;
    images?: Array<{ url: string }>;
  };
  shippingAddress?: any;
  payment?: {
    id: string;
    status: string;
    amount: number;
    provider: string;
  };
  shipment?: {
    id: string;
    trackingNumber?: string;
    carrier?: string;
    status?: string;
  };
  createdAt: string;
  updatedAt: string;
  cancelReason?: string | null;
  offerId?: string | null;
  // 48h pencere (Faz 1.2)
  deliveredAt?: string | null;
  confirmationDeadline?: string | null;
  buyerConfirmedAt?: string | null;
  buyerConfirmationType?: string | null;
  completedAt?: string | null;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: 'Ödeme Bekliyor', color: 'text-warning-600', bg: 'bg-warning-100' },
  paid: { label: 'Ödendi', color: 'text-info-600', bg: 'bg-info-100' },
  preparing: { label: 'Hazırlanıyor', color: 'text-primary-600', bg: 'bg-primary-100' },
  shipped: { label: 'Kargoda', color: 'text-info-600', bg: 'bg-info-100' },
  delivered: { label: 'Teslim Edildi', color: 'text-success-600', bg: 'bg-success-100' },
  awaiting_buyer_confirmation: { label: 'Alıcı Onayı Bekleniyor (48h)', color: 'text-warning-600', bg: 'bg-warning-100' },
  completed: { label: 'Tamamlandı', color: 'text-success-600', bg: 'bg-success-100' },
  cancelled: { label: 'İptal', color: 'text-danger-600', bg: 'bg-danger-100' },
  refunded: { label: 'İade Edildi', color: 'text-muted', bg: 'bg-surface-alt' },
};

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [processing, setProcessing] = useState(false);
  // 48h pencere (Faz 4A.5)
  const [extendOpen, setExtendOpen] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [extending, setExtending] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (orderId) {
      loadOrder();
    }
  }, [orderId]);

  const loadOrder = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getOrder(orderId);
      setOrder(response.data);
      setNewStatus(response.data.status);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Order load error:', error);
      toast.error(error.response?.data?.message || 'Sipariş yüklenemedi');
      router.push('/orders');
    } finally {
      setLoading(false);
    }
  };

  // 48h pencere handler'ları (Faz 4A.5)
  const handleExtend = async (payload: { hours: number; reason?: string }) => {
    setExtending(true);
    try {
      const res = await adminApi.extendOrderConfirmation(orderId, payload);
      toast.success(
        `Pencere uzatıldı — yeni son tarih: ${new Date(
          (res.data as any).newDeadline,
        ).toLocaleString('tr-TR')}`,
      );
      await loadOrder();
    } finally {
      setExtending(false);
    }
  };

  const handleForceComplete = async (payload: { reason?: string }) => {
    setForcing(true);
    try {
      await adminApi.forceCompleteOrder(orderId, payload.reason);
      toast.success('Sipariş manuel tamamlandı.');
      await loadOrder();
    } finally {
      setForcing(false);
    }
  };

  const handleApplyCoupon = async () => {
    setApplyingCoupon(true);
    try {
      await adminApi.applyOrderCoupon(orderId, couponCode.trim() || null);
      toast.success(couponCode.trim() ? 'Kupon uygulandı' : 'Kupon kaldırıldı');
      setCouponModalOpen(false);
      setCouponCode('');
      await loadOrder();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Kupon uygulanamadı');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const handleStatusUpdate = async () => {
    setProcessing(true);
    try {
      await adminApi.updateOrderStatus(orderId, newStatus);
      toast.success('Sipariş durumu güncellendi');
      setShowStatusModal(false);
      loadOrder();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Durum güncelleme başarısız');
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintInvoice = async () => {
    try {
      const response = await adminApi.getOrderInvoice(orderId);
      const invoiceData = response.data;
      const invoiceTheme = {
        heading: dsColors.text.heading,
        body: dsColors.text.body,
        muted: dsColors.text.muted,
        surface: dsColors.surface.alt,
        border: dsColors.border.DEFAULT,
      };

      // Open print window with invoice content
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Fatura - ${invoiceData.invoiceNumber}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid ${invoiceTheme.heading}; padding-bottom: 20px; }
              .header h1 { margin: 0; font-size: 24px; }
              .header p { margin: 5px 0; color: ${invoiceTheme.muted}; }
              .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
              .info-box { background: ${invoiceTheme.surface}; padding: 15px; border-radius: 8px; }
              .info-box h3 { margin: 0 0 10px 0; font-size: 14px; color: ${invoiceTheme.muted}; }
              .info-box p { margin: 3px 0; font-size: 14px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid ${invoiceTheme.border}; padding: 10px; text-align: left; }
              th { background: ${invoiceTheme.surface}; }
              .totals { text-align: right; }
              .totals p { margin: 5px 0; }
              .total-row { font-weight: bold; font-size: 18px; }
              @media print { body { padding: 20px; } }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>FATURA</h1>
              <p>Fatura No: ${invoiceData.invoiceNumber}</p>
              <p>Tarih: ${new Date(invoiceData.orderDate).toLocaleDateString('tr-TR')}</p>
            </div>
            <div class="info-grid">
              <div class="info-box">
                <h3>ALICI</h3>
                <p><strong>${invoiceData.buyer.name}</strong></p>
                <p>${invoiceData.buyer.email}</p>
                ${invoiceData.buyer.phone ? `<p>${invoiceData.buyer.phone}</p>` : ''}
                ${invoiceData.buyer.address ? `<p>${invoiceData.buyer.address}</p>` : ''}
              </div>
              <div class="info-box">
                <h3>SATICI</h3>
                <p><strong>${invoiceData.seller.name}</strong></p>
                <p>${invoiceData.seller.email}</p>
              </div>
            </div>
            <table>
              <thead>
                <tr><th>Ürün</th><th>Adet</th><th>Birim Fiyat</th><th>Toplam</th></tr>
              </thead>
              <tbody>
                ${invoiceData.items.map((item: any) => `
                  <tr>
                    <td>${item.title}</td>
                    <td>${item.quantity}</td>
                    <td>₺${item.unitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    <td>₺${item.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="totals">
              <p>Ara Toplam: ₺${invoiceData.subtotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
              ${invoiceData.discountAmount > 0 ? `<p style="color: #16a34a;">İndirim${invoiceData.discountCode ? ` (${invoiceData.discountCode})` : ''}: -₺${Number(invoiceData.discountAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>` : ''}
              <p>Kargo: ₺${invoiceData.shippingCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
              <p class="total-row">TOPLAM: ₺${invoiceData.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
            </div>
            ${invoiceData.shipment?.trackingNumber ? `
              <div style="margin-top: 20px; padding: 10px; background: ${invoiceTheme.surface}; border-radius: 4px;">
                <strong>Kargo Takip:</strong> ${invoiceData.shipment.carrier || ''} - ${invoiceData.shipment.trackingNumber}
              </div>
            ` : ''}
            <script>window.onload = function() { window.print(); }</script>
          </body>
          </html>
        `);
        printWindow.document.close();
      }
    } catch (error: any) {
      toast.error('Fatura oluşturulamadı');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Spinner size="xl" color="border-primary-600 border-t-transparent" className="mx-auto" />
          <p className="mt-4 text-muted">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Sipariş bulunamadı</p>
      </div>
    );
  }

  const statusInfo = statusConfig[order.status] || statusConfig.pending_payment;

  return (
      <div className="min-h-screen bg-surface">
        <main className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <button
              type="button"
              onClick={() =>
                window.history.length > 1 ? router.back() : router.push('/orders')
              }
              aria-label="Geri"
              className="p-2 hover:bg-border-subtle rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6 text-muted" />
            </button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-heading">Sipariş #{order.orderNumber}</h1>
              <p className="text-sm text-muted">
                {new Date(order.createdAt).toLocaleString('tr-TR')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-4 py-2 rounded-full font-medium ${statusInfo.color} ${statusInfo.bg}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>

          {/* İptal nedeni + köken (#4): stok bitti / teklif iptali gibi */}
          {order.status === 'cancelled' && (cancelReasonLabel(order.cancelReason) || order.offerId) && (
            <div className="mb-6 rounded-lg border border-danger-200 bg-danger-50 px-4 py-3">
              <p className="text-sm font-medium text-danger-700">
                İptal nedeni: {cancelReasonLabel(order.cancelReason) ?? 'Belirtilmemiş'}
              </p>
              <p className="text-xs text-danger-600 mt-0.5">
                Köken: {orderOriginLabel(order.offerId)}
                {order.cancelReason ? ` · "${order.cancelReason}"` : ''}
              </p>
            </div>
          )}

          {/* 48h pencere kartı (Faz 4A.5) */}
          {(order.status === 'awaiting_buyer_confirmation' || order.buyerConfirmedAt) && (
            <div className="mb-6">
              <AwaitingConfirmationCard
                deliveredAt={order.deliveredAt ?? null}
                confirmationDeadline={order.confirmationDeadline ?? null}
                buyerConfirmedAt={order.buyerConfirmedAt ?? null}
                buyerConfirmationType={order.buyerConfirmationType ?? null}
                onExtendClick={() => setExtendOpen(true)}
                onForceCompleteClick={() => setForceOpen(true)}
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2 mb-6">
            <Button variant="secondary" onClick={() => setShowStatusModal(true)}
              className="px-4 py-2 bg-primary-600 text-heading rounded-lg hover:bg-primary-700 transition-colors">
              Durum Güncelle
            </Button>
            <Button variant="secondary" onClick={handlePrintInvoice}
              className="px-4 py-2 bg-surface-alt text-heading rounded-lg hover:bg-border-subtle transition-colors flex items-center gap-2">
              <PrinterIcon className="w-5 h-5" />
              Fatura Yazdır
            </Button>
            <Button variant="secondary" onClick={() => { setCouponCode(order.discountCode || ''); setCouponModalOpen(true); }}
              className="px-4 py-2 bg-surface-alt text-heading rounded-lg hover:bg-border-subtle transition-colors">
              {order.discountCode ? 'Kuponu Değiştir' : 'Kupon Uygula'}
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Order Info */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                  <ShoppingBagIcon className="w-5 h-5" />
                  Sipariş Bilgileri
                </h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-muted text-sm">Durum:</span>
                      <p className="font-medium capitalize text-heading">{statusInfo.label}</p>
                    </div>
                  </div>
                  <div className="border-t pt-4 mt-4">
                    <AdminFinancialSummary
                      pricing={order.pricing ? { ...order.pricing, discountAmount: order.discountAmount, discountCode: order.discountCode } : undefined}
                      fallback={{
                        subtotal: order.subtotal,
                        shippingCost: order.shippingCost,
                        buyerFeeAmount: order.buyerFeeAmount,
                        sellerFeeAmount: order.sellerFeeAmount,
                        commissionAmount: order.commissionAmount,
                        totalAmount: order.totalAmount,
                        sellerNetAmount: order.sellerNetAmount,
                        discountAmount: order.discountAmount,
                        discountCode: order.discountCode,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Product Info */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-heading mb-4">Ürün Bilgileri</h2>
                <div className="flex gap-4">
                  {order.product.images && order.product.images.length > 0 && (
                    <div className="w-24 h-24 rounded-lg overflow-hidden bg-surface-alt flex-shrink-0">
                      <img
                        src={order.product.images[0].url}
                        alt={order.product.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <Link
                      href={`/admin/products/${order.product.id}`}
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {order.product.title}
                    </Link>
                    <p className="text-muted mt-1">
                      ₺{getProductEffectivePrice(order.product).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              {order.payment && (
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                    <CreditCardIcon className="w-5 h-5" />
                    Ödeme Bilgileri
                  </h2>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted">Durum:</span>
                      <span className="font-medium text-heading">{enumLabel(paymentStatusConfig, order.payment.status)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Tutar:</span>
                      <span className="font-medium text-heading">
                        ₺{order.payment.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Sağlayıcı:</span>
                      <span className="text-heading">{enumLabel(paymentProviderConfig, order.payment.provider)}</span>
                    </div>
                    <Link
                      href={`/payments/${order.payment.id}`}
                      className="block mt-3 text-primary-600 hover:text-primary-700 text-sm"
                    >
                      Ödeme Detayını Görüntüle →
                    </Link>
                  </div>
                </div>
              )}

              {/* Shipping Info */}
              {order.shipment && (
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                    <TruckIcon className="w-5 h-5" />
                    Kargo Bilgileri
                  </h2>
                  <div className="space-y-2">
                    {order.shipment.trackingNumber && (
                      <div className="flex justify-between">
                        <span className="text-muted">Takip No:</span>
                        <span className="font-mono text-sm text-heading">{order.shipment.trackingNumber}</span>
                      </div>
                    )}
                    {order.shipment.carrier && (
                      <div className="flex justify-between">
                        <span className="text-muted">Kargo Firması:</span>
                        <span className="text-heading">{enumLabel(shipmentProviderConfig, order.shipment.carrier)}</span>
                      </div>
                    )}
                    {order.shipment.status && (
                      <div className="flex justify-between">
                        <span className="text-muted">Durum:</span>
                        <span className="font-medium text-heading">{enumLabel(shipmentStatusConfig, order.shipment.status)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Shipping Address */}
              {order.shippingAddress && (
                <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                    <MapPinIcon className="w-5 h-5" />
                    Teslimat Adresi
                  </h2>
                  <div className="space-y-1">
                    {typeof order.shippingAddress === 'object' ? (
                      <>
                        {order.shippingAddress.fullName && (
                          <p className="font-medium text-heading">{order.shippingAddress.fullName}</p>
                        )}
                        {order.shippingAddress.address && (
                          <p className="text-muted">{order.shippingAddress.address}</p>
                        )}
                        {order.shippingAddress.district && order.shippingAddress.city && (
                          <p className="text-muted">
                            {order.shippingAddress.district}, {order.shippingAddress.city}
                          </p>
                        )}
                        {order.shippingAddress.postalCode && (
                          <p className="text-muted">Posta Kodu: {order.shippingAddress.postalCode}</p>
                        )}
                        {order.shippingAddress.phone && (
                          <p className="text-muted">Tel: {order.shippingAddress.phone}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted">{String(order.shippingAddress)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Buyer Info */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-heading mb-4">Alıcı</h3>
                <div className="space-y-2">
                  <Link
                    href={`/users/${order.buyer.id}`}
                    className="text-primary-600 hover:text-primary-700 font-medium block"
                  >
                    {order.buyer.displayName}
                  </Link>
                  <p className="text-sm text-muted">{order.buyer.email}</p>
                  {order.buyer.phone && (
                    <p className="text-sm text-muted">{order.buyer.phone}</p>
                  )}
                </div>
              </div>

              {/* Seller Info */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-heading mb-4">Satıcı</h3>
                <div className="space-y-2">
                  <Link
                    href={`/users/${order.seller.id}`}
                    className="text-primary-600 hover:text-primary-700 font-medium block"
                  >
                    {order.seller.displayName}
                  </Link>
                  <p className="text-sm text-muted">{order.seller.email}</p>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
                  <ClockIcon className="w-5 h-5" />
                  Zaman Çizelgesi
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-heading">Oluşturulma</p>
                    <p className="text-xs text-muted">
                      {new Date(order.createdAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-heading">Son Güncelleme</p>
                    <p className="text-xs text-muted">
                      {new Date(order.updatedAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Status Update Modal */}
        {showStatusModal && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-heading mb-4 leading-tight">Durum Güncelle</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-body mb-2">
                  Yeni Durum
                </label>
                <Select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value="pending_payment">Ödeme Bekliyor</option>
                  <option value="paid">Ödendi</option>
                  <option value="preparing">Hazırlanıyor</option>
                  <option value="shipped">Kargoda</option>
                  <option value="delivered">Teslim Edildi</option>
                  <option value="completed">Tamamlandı</option>
                  <option value="cancelled">İptal</option>
                  <option value="refunded">İade Edildi</option>
                </Select>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setShowStatusModal(false)}
                  className="flex-1 px-4 text-body hover:bg-surface"
                  disabled={processing}>
                  İptal
                </Button>
                <Button variant="secondary" onClick={handleStatusUpdate}
                  className="flex-1 px-4 py-2 bg-primary-600 text-heading rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  disabled={processing}>
                  {processing ? 'İşleniyor...' : 'Güncelle'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Kupon Uygula Modal */}
        {couponModalOpen && (
          <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-heading mb-1 leading-tight">Kupon Uygula</h3>
              <p className="text-sm text-muted mb-4">
                Kuponu kaldırmak için alanı boş bırakıp kaydedin.
                {order.status !== 'pending_payment' && (
                  <span className="block mt-1 text-warning-600">Not: Sipariş ödendi, toplam tutar güncellenmez — sadece kupon kaydı tutulur.</span>
                )}
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-body mb-2">Kupon Kodu</label>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="ör. YAZI2024"
                  className="w-full px-3 py-2 border border-border rounded-lg text-heading bg-surface focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleApplyCoupon(); }}
                />
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => { setCouponModalOpen(false); setCouponCode(''); }}
                  className="flex-1 px-4 text-body hover:bg-surface"
                  disabled={applyingCoupon}>
                  İptal
                </Button>
                <Button variant="secondary" onClick={handleApplyCoupon}
                  className="flex-1 px-4 py-2 bg-primary-600 text-heading rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  disabled={applyingCoupon}>
                  {applyingCoupon ? 'Uygulanıyor...' : 'Kaydet'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 48h pencere dialog'ları (Faz 4A.5) */}
        <ExtendConfirmationDialog
          open={extendOpen}
          onClose={() => setExtendOpen(false)}
          onConfirm={handleExtend}
          loading={extending}
        />
        <ForceCompleteDialog
          open={forceOpen}
          onClose={() => setForceOpen(false)}
          onConfirm={handleForceComplete}
          loading={forcing}
        />
      </div>
  );
}
