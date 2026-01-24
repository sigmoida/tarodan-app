'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ShoppingBagIcon,
  CreditCardIcon,
  TruckIcon,
  MapPinIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import AdminLayout from '@/components/AdminLayout';

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  commissionAmount: number;
  shippingCost: number;
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
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending_payment: { label: 'Ödeme Bekliyor', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  paid: { label: 'Ödendi', color: 'text-blue-600', bg: 'bg-blue-100' },
  preparing: { label: 'Hazırlanıyor', color: 'text-purple-600', bg: 'bg-purple-100' },
  shipped: { label: 'Kargoda', color: 'text-indigo-600', bg: 'bg-indigo-100' },
  delivered: { label: 'Teslim Edildi', color: 'text-green-600', bg: 'bg-green-100' },
  completed: { label: 'Tamamlandı', color: 'text-green-600', bg: 'bg-green-100' },
  cancelled: { label: 'İptal', color: 'text-red-600', bg: 'bg-red-100' },
  refunded: { label: 'İade Edildi', color: 'text-gray-600', bg: 'bg-gray-100' },
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
      console.error('Order load error:', error);
      toast.error(error.response?.data?.message || 'Sipariş yüklenemedi');
      router.push('/admin/orders');
    } finally {
      setLoading(false);
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

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Yükleniyor...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!order) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">Sipariş bulunamadı</p>
        </div>
      </AdminLayout>
    );
  }

  const statusInfo = statusConfig[order.status] || statusConfig.pending_payment;

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/admin/orders"
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">Sipariş #{order.orderNumber}</h1>
              <p className="text-sm text-gray-500">
                {new Date(order.createdAt).toLocaleString('tr-TR')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-4 py-2 rounded-full font-medium ${statusInfo.color} ${statusInfo.bg}`}>
                {statusInfo.label}
              </span>
              <button
                onClick={() => setShowStatusModal(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                Durum Güncelle
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Order Info */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <ShoppingBagIcon className="w-5 h-5" />
                  Sipariş Bilgileri
                </h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-600 text-sm">Toplam Tutar:</span>
                      <p className="font-semibold text-lg">
                        ₺{order.totalAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600 text-sm">Komisyon:</span>
                      <p className="font-medium">
                        ₺{order.commissionAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                    <div>
                      <span className="text-gray-600 text-sm">Kargo Ücreti:</span>
                      <p className="font-medium">
                        ₺{order.shippingCost.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <span className="text-gray-600 text-sm">Durum:</span>
                      <p className="font-medium capitalize">{statusInfo.label}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Info */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Ürün Bilgileri</h2>
                <div className="flex gap-4">
                  {order.product.images && order.product.images.length > 0 && (
                    <div className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
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
                    <p className="text-gray-600 mt-1">
                      ₺{order.product.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              {order.payment && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <CreditCardIcon className="w-5 h-5" />
                    Ödeme Bilgileri
                  </h2>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Durum:</span>
                      <span className="font-medium capitalize">{order.payment.status}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tutar:</span>
                      <span className="font-medium">
                        ₺{order.payment.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Sağlayıcı:</span>
                      <span className="uppercase">{order.payment.provider}</span>
                    </div>
                    <Link
                      href={`/admin/payments/${order.payment.id}`}
                      className="block mt-3 text-primary-600 hover:text-primary-700 text-sm"
                    >
                      Ödeme Detayını Görüntüle →
                    </Link>
                  </div>
                </div>
              )}

              {/* Shipping Info */}
              {order.shipment && (
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <TruckIcon className="w-5 h-5" />
                    Kargo Bilgileri
                  </h2>
                  <div className="space-y-2">
                    {order.shipment.trackingNumber && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Takip No:</span>
                        <span className="font-mono text-sm">{order.shipment.trackingNumber}</span>
                      </div>
                    )}
                    {order.shipment.carrier && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Kargo Firması:</span>
                        <span>{order.shipment.carrier}</span>
                      </div>
                    )}
                    {order.shipment.status && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Durum:</span>
                        <span className="font-medium capitalize">{order.shipment.status}</span>
                      </div>
                    )}
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
                  <div className="space-y-1">
                    {typeof order.shippingAddress === 'object' ? (
                      <>
                        {order.shippingAddress.fullName && (
                          <p className="font-medium">{order.shippingAddress.fullName}</p>
                        )}
                        {order.shippingAddress.address && (
                          <p className="text-gray-600">{order.shippingAddress.address}</p>
                        )}
                        {order.shippingAddress.district && order.shippingAddress.city && (
                          <p className="text-gray-600">
                            {order.shippingAddress.district}, {order.shippingAddress.city}
                          </p>
                        )}
                        {order.shippingAddress.postalCode && (
                          <p className="text-gray-600">Posta Kodu: {order.shippingAddress.postalCode}</p>
                        )}
                        {order.shippingAddress.phone && (
                          <p className="text-gray-600">Tel: {order.shippingAddress.phone}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-gray-600">{String(order.shippingAddress)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Buyer Info */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Alıcı</h3>
                <div className="space-y-2">
                  <Link
                    href={`/admin/users/${order.buyer.id}`}
                    className="text-primary-600 hover:text-primary-700 font-medium block"
                  >
                    {order.buyer.displayName}
                  </Link>
                  <p className="text-sm text-gray-600">{order.buyer.email}</p>
                  {order.buyer.phone && (
                    <p className="text-sm text-gray-600">{order.buyer.phone}</p>
                  )}
                </div>
              </div>

              {/* Seller Info */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Satıcı</h3>
                <div className="space-y-2">
                  <Link
                    href={`/admin/users/${order.seller.id}`}
                    className="text-primary-600 hover:text-primary-700 font-medium block"
                  >
                    {order.seller.displayName}
                  </Link>
                  <p className="text-sm text-gray-600">{order.seller.email}</p>
                </div>
              </div>

              {/* Timeline */}
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <ClockIcon className="w-5 h-5" />
                  Zaman Çizelgesi
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Oluşturulma</p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleString('tr-TR')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Son Güncelleme</p>
                    <p className="text-xs text-gray-500">
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Durum Güncelle</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Yeni Durum
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="pending_payment">Ödeme Bekliyor</option>
                  <option value="paid">Ödendi</option>
                  <option value="preparing">Hazırlanıyor</option>
                  <option value="shipped">Kargoda</option>
                  <option value="delivered">Teslim Edildi</option>
                  <option value="completed">Tamamlandı</option>
                  <option value="cancelled">İptal</option>
                  <option value="refunded">İade Edildi</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowStatusModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={processing}
                >
                  İptal
                </button>
                <button
                  onClick={handleStatusUpdate}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  disabled={processing}
                >
                  {processing ? 'İşleniyor...' : 'Güncelle'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
