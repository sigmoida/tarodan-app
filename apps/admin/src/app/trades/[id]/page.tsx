'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  UserIcon,
  CubeIcon,
  TruckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';
import AdminLayout from '@/components/AdminLayout';

interface TradeDetail {
  id: string;
  status: string;
  initiator: {
    id: string;
    displayName: string;
    email: string;
  };
  receiver: {
    id: string;
    displayName: string;
    email: string;
  };
  initiatorItems: Array<{
    id: string;
    product: {
      id: string;
      title: string;
      price: number;
      images?: Array<{ url: string }>;
    };
  }>;
  receiverItems: Array<{
    id: string;
    product: {
      id: string;
      title: string;
      price: number;
      images?: Array<{ url: string }>;
    };
  }>;
  shipments?: Array<{
    id: string;
    trackingNumber?: string;
    carrier?: string;
    status?: string;
  }>;
  dispute?: {
    id: string;
    reason: string;
    description?: string;
    resolution?: string;
  };
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Beklemede', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  accepted: { label: 'Kabul Edildi', color: 'text-blue-600', bg: 'bg-blue-100' },
  shipped: { label: 'Kargoda', color: 'text-indigo-600', bg: 'bg-indigo-100' },
  completed: { label: 'Tamamlandı', color: 'text-green-600', bg: 'bg-green-100' },
  cancelled: { label: 'İptal', color: 'text-red-600', bg: 'bg-red-100' },
  disputed: { label: 'İtiraz', color: 'text-orange-600', bg: 'bg-orange-100' },
};

export default function TradeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tradeId = params.id as string;

  const [trade, setTrade] = useState<TradeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolution, setResolution] = useState('complete_trade');
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (tradeId) {
      loadTrade();
    }
  }, [tradeId]);

  const loadTrade = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getTrade(tradeId);
      setTrade(response.data);
    } catch (error: any) {
      console.error('Trade load error:', error);
      toast.error(error.response?.data?.message || 'Takas yüklenemedi');
      router.push('/admin/trades');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    setProcessing(true);
    try {
      await adminApi.resolveTrade(tradeId, { resolution, note });
      toast.success('Takas çözümlendi');
      setShowResolveModal(false);
      setResolution('complete_trade');
      setNote('');
      loadTrade();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Çözüm işlemi başarısız');
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

  if (!trade) {
    return (
      <AdminLayout>
        <div className="text-center py-12">
          <p className="text-gray-600">Takas bulunamadı</p>
        </div>
      </AdminLayout>
    );
  }

  const statusInfo = statusConfig[trade.status] || statusConfig.pending;
  const canResolve = trade.status === 'disputed';

  return (
    <AdminLayout>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <Link
              href="/admin/trades"
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">Takas Detayı</h1>
              <p className="text-sm text-gray-500">
                {new Date(trade.createdAt).toLocaleString('tr-TR')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-4 py-2 rounded-full font-medium ${statusInfo.color} ${statusInfo.bg}`}>
                {statusInfo.label}
              </span>
              {canResolve && (
                <button
                  onClick={() => setShowResolveModal(true)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Çözümle
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Initiator Side */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <UserIcon className="w-5 h-5" />
                  Teklif Veren
                </h2>
                <div className="space-y-2 mb-4">
                  <Link
                    href={`/admin/users/${trade.initiator.id}`}
                    className="text-primary-600 hover:text-primary-700 font-medium block"
                  >
                    {trade.initiator.displayName}
                  </Link>
                  <p className="text-sm text-gray-600">{trade.initiator.email}</p>
                </div>
                <div className="space-y-3">
                  <h3 className="font-medium text-gray-900">Teklif Edilen Ürünler:</h3>
                  {trade.initiatorItems.map((item) => (
                    <div key={item.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                      {item.product.images && item.product.images.length > 0 && (
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          <img
                            src={item.product.images[0].url}
                            alt={item.product.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <Link
                          href={`/admin/products/${item.product.id}`}
                          className="text-primary-600 hover:text-primary-700 font-medium text-sm"
                        >
                          {item.product.title}
                        </Link>
                        <p className="text-xs text-gray-600">
                          ₺{item.product.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Receiver Side */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <UserIcon className="w-5 h-5" />
                  Teklif Alan
                </h2>
                <div className="space-y-2 mb-4">
                  <Link
                    href={`/admin/users/${trade.receiver.id}`}
                    className="text-primary-600 hover:text-primary-700 font-medium block"
                  >
                    {trade.receiver.displayName}
                  </Link>
                  <p className="text-sm text-gray-600">{trade.receiver.email}</p>
                </div>
                <div className="space-y-3">
                  <h3 className="font-medium text-gray-900">Karşılık Verilen Ürünler:</h3>
                  {trade.receiverItems.map((item) => (
                    <div key={item.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg">
                      {item.product.images && item.product.images.length > 0 && (
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          <img
                            src={item.product.images[0].url}
                            alt={item.product.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <Link
                          href={`/admin/products/${item.product.id}`}
                          className="text-primary-600 hover:text-primary-700 font-medium text-sm"
                        >
                          {item.product.title}
                        </Link>
                        <p className="text-xs text-gray-600">
                          ₺{item.product.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Shipments */}
          {trade.shipments && trade.shipments.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <TruckIcon className="w-5 h-5" />
                Kargo Bilgileri
              </h2>
              <div className="space-y-3">
                {trade.shipments.map((shipment) => (
                  <div key={shipment.id} className="p-3 bg-gray-50 rounded-lg">
                    {shipment.trackingNumber && (
                      <p className="font-medium">Takip No: {shipment.trackingNumber}</p>
                    )}
                    {shipment.carrier && <p className="text-sm text-gray-600">Firma: {shipment.carrier}</p>}
                    {shipment.status && (
                      <p className="text-sm text-gray-600">Durum: {shipment.status}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dispute */}
          {trade.dispute && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-orange-600" />
                İtiraz
              </h2>
              <div className="space-y-2">
                <p>
                  <span className="font-medium">Neden:</span> {trade.dispute.reason}
                </p>
                {trade.dispute.description && (
                  <p>
                    <span className="font-medium">Açıklama:</span> {trade.dispute.description}
                  </p>
                )}
                {trade.dispute.resolution && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800">
                      <strong>Çözüm:</strong> {trade.dispute.resolution}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Zaman Çizelgesi</h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Oluşturulma</p>
                <p className="text-xs text-gray-500">
                  {new Date(trade.createdAt).toLocaleString('tr-TR')}
                </p>
              </div>
              {trade.completedAt && (
                <div>
                  <p className="text-sm font-medium">Tamamlanma</p>
                  <p className="text-xs text-gray-500">
                    {new Date(trade.completedAt).toLocaleString('tr-TR')}
                  </p>
                </div>
              )}
              {trade.cancelledAt && (
                <div>
                  <p className="text-sm font-medium">İptal</p>
                  <p className="text-xs text-gray-500">
                    {new Date(trade.cancelledAt).toLocaleString('tr-TR')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Resolve Modal */}
        {showResolveModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Takas Çözümle</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Çözüm
                </label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="complete_trade">Takası Tamamla</option>
                  <option value="cancel">Takası İptal Et</option>
                  <option value="favor_initiator">Teklif Veren Lehine</option>
                  <option value="favor_receiver">Teklif Alan Lehine</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Not (Opsiyonel)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={3}
                  placeholder="Çözüm notu..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowResolveModal(false);
                    setResolution('complete_trade');
                    setNote('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={processing}
                >
                  İptal
                </button>
                <button
                  onClick={handleResolve}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  disabled={processing}
                >
                  {processing ? 'İşleniyor...' : 'Çözümle'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
