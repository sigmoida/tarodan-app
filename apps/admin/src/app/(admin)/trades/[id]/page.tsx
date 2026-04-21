'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  UserIcon,
  TruckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  BuildingStorefrontIcon,
  ArrowUturnLeftIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { adminApi } from '@/lib/api';
import { getProductEffectivePrice } from '@/lib/productPrice';
import { Button, Modal, Select, Spinner, StatusBadge, Textarea, cn, tradeStatusConfig } from '@tarodan/ui';
import toast from 'react-hot-toast';

// ---------- Types ----------
interface TradeShipment {
  id: string;
  leg?: 'to_warehouse' | 'from_warehouse' | 'return';
  recipientUserId?: string;
  recipientType?: string;
  trackingNumber?: string;
  carrier?: string;
  status?: string;
  deliveredAt?: string | null;
  shippedAt?: string | null;
  sender?: { id: string; displayName: string } | null;
  recipient?: { id: string; displayName: string } | null;
}

interface TradeDetail {
  id: string;
  tradeNumber?: string;
  status: string;
  cashAmount?: number;
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
  shipments?: TradeShipment[];
  dispute?: {
    id: string;
    reason: string;
    description?: string;
    resolution?: string;
  };
  adminNotes?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  createdAt: string;
  acceptedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  warehouseReceivedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

// ---------- Helpers ----------
const legLabels: Record<string, string> = {
  to_warehouse: 'Depoya Giden',
  from_warehouse: 'Depodan Alıcıya',
  return: 'İade',
};

function groupShipmentsByLeg(shipments: TradeShipment[] = []) {
  return shipments.reduce<Record<string, TradeShipment[]>>(
    (acc, s) => {
      const leg = s.leg || 'other';
      if (!acc[leg]) acc[leg] = [];
      acc[leg].push(s);
      return acc;
    },
    {},
  );
}

function isShipmentDelivered(s: TradeShipment): boolean {
  return !!s.deliveredAt || s.status === 'delivered';
}

// ---------- Component ----------
export default function TradeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tradeId = params.id as string;

  const [trade, setTrade] = useState<TradeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Legacy dispute resolve modal
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolution, setResolution] = useState('complete_trade');
  const [resolveNote, setResolveNote] = useState('');
  const [processingResolve, setProcessingResolve] = useState(false);

  // Approve modal
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveNotes, setApproveNotes] = useState('');
  const [processingApprove, setProcessingApprove] = useState(false);

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processingReject, setProcessingReject] = useState(false);

  // Per-shipment action loading
  const [processingShipmentId, setProcessingShipmentId] = useState<string | null>(null);

  useEffect(() => {
    if (tradeId) loadTrade();
  }, [tradeId]);

  const loadTrade = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getTrade(tradeId);
      setTrade(response.data);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Trade load error:', error);
      toast.error(error.response?.data?.message || 'Takas yüklenemedi');
      router.push('/trades');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    setProcessingResolve(true);
    try {
      await adminApi.resolveTrade(tradeId, { resolution, note: resolveNote });
      toast.success('Takas çözümlendi');
      setShowResolveModal(false);
      setResolution('complete_trade');
      setResolveNote('');
      await loadTrade();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Çözüm işlemi başarısız');
    } finally {
      setProcessingResolve(false);
    }
  };

  const handleMarkWarehouseReceived = async (shipmentId: string) => {
    if (!confirm('Bu gönderinin depoya ulaştığını onaylıyor musunuz?')) return;
    setProcessingShipmentId(shipmentId);
    try {
      await adminApi.markWarehouseReceived(tradeId, shipmentId);
      toast.success('Gönderi depoya ulaştı olarak işaretlendi');
      await loadTrade();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setProcessingShipmentId(null);
    }
  };

  const handleMarkReturnDelivered = async (shipmentId: string) => {
    if (!confirm('Bu iade gönderisinin teslim edildiğini onaylıyor musunuz?')) return;
    setProcessingShipmentId(shipmentId);
    try {
      await adminApi.markReturnDelivered(tradeId, shipmentId);
      toast.success('İade gönderisi teslim edildi olarak işaretlendi');
      await loadTrade();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setProcessingShipmentId(null);
    }
  };

  const handleApprove = async () => {
    setProcessingApprove(true);
    try {
      await adminApi.approveTrade(tradeId, approveNotes.trim() || undefined);
      toast.success('Takas onaylandı, ürünler alıcılara gönderiliyor');
      setShowApproveModal(false);
      setApproveNotes('');
      await loadTrade();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Onaylama başarısız');
    } finally {
      setProcessingApprove(false);
    }
  };

  const handleReject = async () => {
    const reason = rejectReason.trim();
    if (reason.length < 10) {
      toast.error('Red sebebi en az 10 karakter olmalıdır');
      return;
    }
    setProcessingReject(true);
    try {
      await adminApi.rejectTrade(tradeId, reason);
      toast.success('Takas reddedildi, ürünler iade ediliyor');
      setShowRejectModal(false);
      setRejectReason('');
      await loadTrade();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Reddetme başarısız');
    } finally {
      setProcessingReject(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Spinner size="xl" color="border-primary-600 border-t-transparent" className="mx-auto" />
          <p className="mt-4 text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Takas bulunamadı</p>
      </div>
    );
  }

  const shipmentsByLeg = groupShipmentsByLeg(trade.shipments || []);
  const toWarehouseShipments = shipmentsByLeg['to_warehouse'] || [];
  const fromWarehouseShipments = shipmentsByLeg['from_warehouse'] || [];
  const returnShipments = shipmentsByLeg['return'] || [];

  const isLegacyDisputed = trade.status === 'disputed';
  const canMarkWarehouse = trade.status === 'shipping_to_warehouse';
  const canApproveReject = trade.status === 'at_warehouse' || trade.status === 'admin_reviewing';
  const isShippingToRecipients = trade.status === 'shipping_to_recipients';
  const isReturning = trade.status === 'returning';

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/trades"
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-gray-600" />
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">
              Takas Detayı
              {trade.tradeNumber && (
                <span className="ml-3 text-base font-mono text-gray-500">{trade.tradeNumber}</span>
              )}
            </h1>
            <p className="text-sm text-gray-500">
              Oluşturulma: {new Date(trade.createdAt).toLocaleString('tr-TR')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={trade.status} config={tradeStatusConfig} />
            {isLegacyDisputed && (
              <Button variant="primary" onClick={() => setShowResolveModal(true)}>
                Çözümle
              </Button>
            )}
          </div>
        </div>

        {/* Admin Action Panel (prominent for review queue) */}
        {canApproveReject && (
          <div className="bg-warning-50 border-2 border-warning-400 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <BuildingStorefrontIcon className="h-8 w-8 text-warning-600 flex-shrink-0" />
                <div>
                  <h2 className="text-lg font-semibold text-warning-900">
                    Admin İncelemesi Gerekiyor
                  </h2>
                  <p className="text-sm text-warning-800 mt-1">
                    Her iki ürün de Tarodan deposuna ulaştı. Lütfen ürünleri inceleyip takası
                    onaylayın veya reddedin.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button variant="danger" onClick={() => setShowRejectModal(true)}>
                  <XCircleIcon className="h-5 w-5 mr-1" />
                  Reddet
                </Button>
                <Button variant="success" onClick={() => setShowApproveModal(true)}>
                  <CheckCircleIcon className="h-5 w-5 mr-1" />
                  Onayla
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Cash amount indicator */}
        {trade.cashAmount && trade.cashAmount > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between">
            <span className="font-medium text-gray-900">Nakit Fark</span>
            <span className="text-lg font-semibold text-primary-600">
              +₺{Number(trade.cashAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Parties and items */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Initiator */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <UserIcon className="w-5 h-5" />
              Teklif Veren
            </h2>
            <div className="space-y-2 mb-4">
              <Link
                href={`/users/${trade.initiator.id}`}
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.product.images[0].url}
                        alt={item.product.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <Link
                      href={`/products/${item.product.id}`}
                      className="text-primary-600 hover:text-primary-700 font-medium text-sm"
                    >
                      {item.product.title}
                    </Link>
                    <p className="text-xs text-gray-600">
                      ₺{getProductEffectivePrice(item.product).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Receiver */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <UserIcon className="w-5 h-5" />
              Teklif Alan
            </h2>
            <div className="space-y-2 mb-4">
              <Link
                href={`/users/${trade.receiver.id}`}
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.product.images[0].url}
                        alt={item.product.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <Link
                      href={`/products/${item.product.id}`}
                      className="text-primary-600 hover:text-primary-700 font-medium text-sm"
                    >
                      {item.product.title}
                    </Link>
                    <p className="text-xs text-gray-600">
                      ₺{getProductEffectivePrice(item.product).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Shipments grouped by leg */}
        {trade.shipments && trade.shipments.length > 0 && (
          <div className="space-y-6">
            {/* to_warehouse */}
            {toWarehouseShipments.length > 0 && (
              <ShipmentLegCard
                title="Depoya Giden Gönderiler"
                icon={<TruckIcon className="w-5 h-5" />}
                shipments={toWarehouseShipments}
                actionLabel={canMarkWarehouse ? 'Depoya Ulaştı' : null}
                onAction={canMarkWarehouse ? handleMarkWarehouseReceived : null}
                processingShipmentId={processingShipmentId}
              />
            )}

            {/* from_warehouse */}
            {fromWarehouseShipments.length > 0 && (
              <ShipmentLegCard
                title="Depodan Alıcılara Gönderiler"
                icon={<TruckIcon className="w-5 h-5" />}
                shipments={fromWarehouseShipments}
                actionLabel={null}
                onAction={null}
                processingShipmentId={processingShipmentId}
                infoMessage={
                  isShippingToRecipients
                    ? 'Bilgi: Alıcılar teslim aldıklarında kendi tarafından onaylayacak.'
                    : undefined
                }
              />
            )}

            {/* return */}
            {returnShipments.length > 0 && (
              <ShipmentLegCard
                title="İade Gönderileri"
                icon={<ArrowUturnLeftIcon className="w-5 h-5" />}
                shipments={returnShipments}
                actionLabel={isReturning ? 'Teslim Edildi' : null}
                onAction={isReturning ? handleMarkReturnDelivered : null}
                processingShipmentId={processingShipmentId}
              />
            )}
          </div>
        )}

        {/* Rejection / cancellation reason */}
        {(trade.rejectionReason || trade.cancellationReason) && (
          <div className="bg-danger-50 border border-danger-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-danger-900 mb-2 flex items-center gap-2">
              <XCircleIcon className="w-5 h-5" />
              {trade.rejectionReason ? 'Red Sebebi' : 'İptal Sebebi'}
            </h2>
            <p className="text-sm text-danger-800 whitespace-pre-wrap">
              {trade.rejectionReason || trade.cancellationReason}
            </p>
          </div>
        )}

        {/* Admin notes */}
        {trade.adminNotes && (
          <div className="bg-info-50 border border-info-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-info-900 mb-2">Admin Notları</h2>
            <p className="text-sm text-info-800 whitespace-pre-wrap">{trade.adminNotes}</p>
          </div>
        )}

        {/* Legacy dispute */}
        {trade.dispute && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 text-primary-600" />
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
                <div className="mt-3 p-3 bg-success-50 border border-success-200 rounded-lg">
                  <p className="text-sm text-success-800">
                    <strong>Çözüm:</strong> {trade.dispute.resolution}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ClockIcon className="w-5 h-5" />
            Zaman Çizelgesi
          </h2>
          <div className="space-y-3">
            <TimelineItem label="Oluşturulma" date={trade.createdAt} />
            {trade.acceptedAt && <TimelineItem label="Kabul Edildi" date={trade.acceptedAt} />}
            {trade.warehouseReceivedAt && (
              <TimelineItem label="Depoya Ulaştı" date={trade.warehouseReceivedAt} />
            )}
            {trade.approvedAt && <TimelineItem label="Onaylandı" date={trade.approvedAt} />}
            {trade.rejectedAt && <TimelineItem label="Reddedildi" date={trade.rejectedAt} />}
            {trade.completedAt && <TimelineItem label="Tamamlandı" date={trade.completedAt} />}
            {trade.cancelledAt && <TimelineItem label="İptal" date={trade.cancelledAt} />}
          </div>
        </div>
      </main>

      {/* Approve Modal */}
      <Modal
        isOpen={showApproveModal}
        onClose={() => !processingApprove && setShowApproveModal(false)}
        title="Takası Onayla"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Takas onaylandığında, her iki ürün de depodan alıcılara gönderilecek ve nakit fark
            alıcıya aktarılacaktır.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Not (Opsiyonel)
            </label>
            <Textarea value={approveNotes}
              onChange={(e) => setApproveNotes(e.target.value)}
              rows={3}
              placeholder="Onay notu..."
              disabled={processingApprove} />
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowApproveModal(false)}
              disabled={processingApprove}
            >
              İptal
            </Button>
            <Button
              variant="success"
              className="flex-1"
              onClick={handleApprove}
              isLoading={processingApprove}
            >
              Onayla
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => !processingReject && setShowRejectModal(false)}
        title="Takası Reddet"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Takas reddedildiğinde, her iki ürün de sahiplerine iade edilecek ve alıcının ödediği
            nakit geri iade edilecektir.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Red Sebebi <span className="text-danger-600">*</span>
            </label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className={
                rejectReason.length > 0 && rejectReason.trim().length < 10
                  ? 'border-danger-400 focus:border-danger-500 focus:ring-danger-200'
                  : undefined
              }
              rows={4}
              placeholder="Lütfen en az 10 karakter ile red sebebini belirtin..."
              disabled={processingReject}
            />
            <p className="mt-1 text-xs text-gray-500">
              {rejectReason.trim().length}/10 karakter minimum
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowRejectModal(false)}
              disabled={processingReject}
            >
              İptal
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleReject}
              isLoading={processingReject}
              disabled={rejectReason.trim().length < 10}
            >
              Reddet
            </Button>
          </div>
        </div>
      </Modal>

      {/* Legacy Resolve Modal */}
      <Modal
        isOpen={showResolveModal}
        onClose={() => !processingResolve && setShowResolveModal(false)}
        title="Takas Çözümle"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Çözüm</label>
            <Select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              disabled={processingResolve}
            >
              <option value="complete_trade">Takası Tamamla</option>
              <option value="cancel">Takası İptal Et</option>
              <option value="favor_initiator">Teklif Veren Lehine</option>
              <option value="favor_receiver">Teklif Alan Lehine</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Not (Opsiyonel)
            </label>
            <Textarea value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              rows={3}
              placeholder="Çözüm notu..."
              disabled={processingResolve} />
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowResolveModal(false)}
              disabled={processingResolve}
            >
              İptal
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={handleResolve}
              isLoading={processingResolve}
            >
              Çözümle
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------- Sub-components ----------
interface ShipmentLegCardProps {
  title: string;
  icon: React.ReactNode;
  shipments: TradeShipment[];
  actionLabel: string | null;
  onAction: ((shipmentId: string) => void) | null;
  processingShipmentId: string | null;
  infoMessage?: string;
}

function ShipmentLegCard({
  title,
  icon,
  shipments,
  actionLabel,
  onAction,
  processingShipmentId,
  infoMessage,
}: ShipmentLegCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        {icon}
        {title}
        <span className="text-sm font-normal text-gray-500">({shipments.length})</span>
      </h2>
      {infoMessage && (
        <p className="text-sm text-info-700 bg-info-50 border border-info-200 rounded p-3 mb-4">
          {infoMessage}
        </p>
      )}
      <div className="space-y-3">
        {shipments.map((s) => {
          const delivered = isShipmentDelivered(s);
          const isProcessing = processingShipmentId === s.id;
          return (
            <div
              key={s.id}
              className={cn(
                'p-4 rounded-lg border',
                delivered ? 'bg-success-50 border-success-200' : 'bg-gray-50 border-gray-200',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1 text-sm">
                  {s.sender && (
                    <p>
                      <span className="font-medium text-gray-700">Gönderen:</span>{' '}
                      <Link
                        href={`/users/${s.sender.id}`}
                        className="text-primary-600 hover:underline"
                      >
                        {s.sender.displayName}
                      </Link>
                    </p>
                  )}
                  {s.recipient && (
                    <p>
                      <span className="font-medium text-gray-700">Alıcı:</span>{' '}
                      <Link
                        href={`/users/${s.recipient.id}`}
                        className="text-primary-600 hover:underline"
                      >
                        {s.recipient.displayName}
                      </Link>
                      {s.recipientType && (
                        <span className="text-xs text-gray-500 ml-1">({s.recipientType})</span>
                      )}
                    </p>
                  )}
                  {s.trackingNumber && (
                    <p>
                      <span className="font-medium text-gray-700">Takip No:</span>{' '}
                      <span className="font-mono">{s.trackingNumber}</span>
                    </p>
                  )}
                  {s.carrier && (
                    <p>
                      <span className="font-medium text-gray-700">Firma:</span> {s.carrier}
                    </p>
                  )}
                  {s.status && (
                    <p>
                      <span className="font-medium text-gray-700">Durum:</span> {s.status}
                    </p>
                  )}
                  {s.shippedAt && (
                    <p className="text-xs text-gray-500">
                      Gönderim: {new Date(s.shippedAt).toLocaleString('tr-TR')}
                    </p>
                  )}
                  {s.deliveredAt && (
                    <p className="text-xs text-success-700">
                      Teslim: {new Date(s.deliveredAt).toLocaleString('tr-TR')}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 items-end">
                  {delivered ? (
                    <span className="inline-flex items-center gap-1 text-success-700 text-sm font-medium">
                      <CheckCircleIcon className="w-5 h-5" />
                      Teslim Edildi
                    </span>
                  ) : actionLabel && onAction ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onAction(s.id)}
                      isLoading={isProcessing}
                    >
                      {actionLabel}
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-500">Beklemede</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineItem({ label, date }: { label: string; date: string }) {
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-gray-500">{new Date(date).toLocaleString('tr-TR')}</p>
    </div>
  );
}
