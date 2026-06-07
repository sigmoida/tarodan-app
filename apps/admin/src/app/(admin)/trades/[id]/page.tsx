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
import { cancelReasonLabel } from '@/lib/utils';
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
  lostAt?: string | null;
  lostReason?: string | null;
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
  cancelReason?: string;
  createdAt: string;
  acceptedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  warehouseReceivedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  firstWarehouseArrivalAt?: string | null;
  cancelLockedAt?: string | null;
  refundFailureReason?: string | null;
  refundFailureAt?: string | null;
  compensationPendingUserId?: string | null;
  compensationResolvedAt?: string | null;
}

type RawTradeItem = {
  id: string;
  side?: string;
  product?: {
    id: string;
    title: string;
    price: number;
    images?: Array<{ url: string }>;
  };
};

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

  const [processingRetryRefund, setProcessingRetryRefund] = useState(false);
  const [processingResolveCompensation, setProcessingResolveCompensation] = useState(false);

  const [markLostShipmentId, setMarkLostShipmentId] = useState<string | null>(null);
  const [markLostReason, setMarkLostReason] = useState('');
  const [processingMarkLost, setProcessingMarkLost] = useState(false);

  const [showForceCancelModal, setShowForceCancelModal] = useState(false);
  const [forceCancelReason, setForceCancelReason] = useState('');
  const [forceCancelSendBack, setForceCancelSendBack] = useState(true);
  const [processingForceCancel, setProcessingForceCancel] = useState(false);

  useEffect(() => {
    if (tradeId) loadTrade();
  }, [tradeId]);

  const loadTrade = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getTrade(tradeId);
      const payload = response.data?.data ?? response.data;
      const rawItems: RawTradeItem[] = Array.isArray(payload?.items) ? payload.items : [];
      const initiatorItems = Array.isArray(payload?.initiatorItems)
        ? payload.initiatorItems
        : rawItems.filter((item) => item.side === 'initiator' && item.product);
      const receiverItems = Array.isArray(payload?.receiverItems)
        ? payload.receiverItems
        : rawItems.filter((item) => item.side === 'receiver' && item.product);

      setTrade({
        ...payload,
        initiatorItems,
        receiverItems,
        shipments: Array.isArray(payload?.shipments) ? payload.shipments : [],
      });
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Trade load error:', error);
      toast.error(error.response?.data?.message || 'Takas yüklenemedi');
      router.push('/trades');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    const notes = resolveNote.trim();
    if (notes.length < 10) {
      toast.error('Çözüm notu en az 10 karakter olmalıdır');
      return;
    }
    setProcessingResolve(true);
    try {
      await adminApi.resolveTradeDispute(tradeId, resolution, notes);
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

  const handleResolveCompensation = async () => {
    const note = window.prompt('Tazminat çözüm notu (opsiyonel):') ?? undefined;
    if (note === null) return; // user cancelled
    setProcessingResolveCompensation(true);
    try {
      await adminApi.resolveTradeCompensation(tradeId, note || undefined);
      toast.success('Tazminat kapatıldı');
      await loadTrade();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setProcessingResolveCompensation(false);
    }
  };

  const handleRetryRefund = async () => {
    if (!confirm('PayTR iadesi yeniden denenecek. Devam edilsin mi?')) return;
    setProcessingRetryRefund(true);
    try {
      const response = await adminApi.retryTradeRefund(tradeId);
      const data = response.data?.data ?? response.data;
      if (data?.refunded) {
        toast.success('İade başarıyla tekrar gönderildi');
      } else if (data?.skippedReason) {
        toast.success(`İade atlandı: ${data.skippedReason}`);
      } else {
        toast.success('İade işlemi tamamlandı');
      }
      await loadTrade();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İade yeniden denemesi başarısız');
    } finally {
      setProcessingRetryRefund(false);
    }
  };

  const handleMarkReturnLost = async () => {
    if (!markLostShipmentId) return;
    const reason = markLostReason.trim();
    if (reason.length < 10) {
      toast.error('Kayıp gerekçesi en az 10 karakter olmalıdır');
      return;
    }
    setProcessingMarkLost(true);
    try {
      await adminApi.markTradeReturnLost(tradeId, {
        shipmentId: markLostShipmentId,
        reason,
      });
      toast.success('İade gönderisi kayıp olarak işaretlendi');
      setMarkLostShipmentId(null);
      setMarkLostReason('');
      await loadTrade();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setProcessingMarkLost(false);
    }
  };

  const handleForceCancel = async () => {
    const reason = forceCancelReason.trim();
    if (reason.length < 10) {
      toast.error('İptal gerekçesi en az 10 karakter olmalıdır');
      return;
    }
    setProcessingForceCancel(true);
    try {
      await adminApi.forceCancelStuckTrade(tradeId, {
        reason,
        sendArrivedItemBack: forceCancelSendBack,
      });
      toast.success('Sıkışmış takas çözüldü');
      setShowForceCancelModal(false);
      setForceCancelReason('');
      setForceCancelSendBack(true);
      await loadTrade();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'İşlem başarısız');
    } finally {
      setProcessingForceCancel(false);
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
          <p className="mt-4 text-muted">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">Takas bulunamadı</p>
      </div>
    );
  }

  const initiatorItems = Array.isArray(trade.initiatorItems) ? trade.initiatorItems : [];
  const receiverItems = Array.isArray(trade.receiverItems) ? trade.receiverItems : [];
  const shipmentsByLeg = groupShipmentsByLeg(trade.shipments || []);
  const toWarehouseShipments = shipmentsByLeg['to_warehouse'] || [];
  const fromWarehouseShipments = shipmentsByLeg['from_warehouse'] || [];
  const returnShipments = shipmentsByLeg['return'] || [];

  const isLegacyDisputed = trade.status === 'disputed';
  const canMarkWarehouse = trade.status === 'shipping_to_warehouse';
  const canApproveReject = trade.status === 'at_warehouse' || trade.status === 'admin_reviewing';
  const isShippingToRecipients = trade.status === 'shipping_to_recipients';
  const isReturning = trade.status === 'returning';
  const canForceCancelStuck =
    trade.status === 'shipping_to_warehouse' &&
    !!trade.firstWarehouseArrivalAt &&
    toWarehouseShipments.some((s) => !s.deliveredAt);

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/trades"
            className="p-2 hover:bg-border-subtle rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6 text-muted" />
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-heading">
              Takas Detayı
              {trade.tradeNumber && (
                <span className="ml-3 text-base font-mono text-muted">{trade.tradeNumber}</span>
              )}
            </h1>
            <p className="text-sm text-muted">
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

        {/* Compensation pending — manual settlement required for a user */}
        {trade.compensationPendingUserId && !trade.compensationResolvedAt && (
          <div className="bg-warning-50 border-2 border-warning-400 rounded-xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="h-7 w-7 text-warning-700 flex-shrink-0" />
                <div>
                  <h2 className="text-base font-semibold text-warning-900">
                    Manuel Tazminat Bekleniyor
                  </h2>
                  <p className="text-sm text-warning-800 mt-1">
                    Kullanıcı{' '}
                    <span className="font-mono">
                      {trade.compensationPendingUserId === trade.initiator.id
                        ? `${trade.initiator.displayName} (teklif veren)`
                        : trade.compensationPendingUserId === trade.receiver.id
                        ? `${trade.receiver.displayName} (teklif alan)`
                        : trade.compensationPendingUserId}
                    </span>{' '}
                    için platform tazminatı işaretlendi. Ödemeyi out-of-band yaptıktan sonra "Kapatıldı" butonuna basın.
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <Button
                  variant="primary"
                  onClick={handleResolveCompensation}
                  isLoading={processingResolveCompensation}
                  disabled={processingResolveCompensation}
                >
                  Kapatıldı
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Refund failure banner — admin must retry the PayTR refund */}
        {trade.refundFailureReason && (
          <div className="bg-danger-50 border-2 border-danger-400 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="h-8 w-8 text-danger-600 flex-shrink-0" />
                <div>
                  <h2 className="text-lg font-semibold text-danger-900">
                    PayTR İadesi Başarısız
                  </h2>
                  <p className="text-sm text-danger-800 mt-1">
                    {trade.refundFailureReason}
                  </p>
                  {trade.refundFailureAt && (
                    <p className="text-xs text-danger-700 mt-1">
                      Son hata: {new Date(trade.refundFailureAt).toLocaleString('tr-TR')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0">
                <Button
                  variant="danger"
                  onClick={handleRetryRefund}
                  isLoading={processingRetryRefund}
                  disabled={processingRetryRefund}
                >
                  <ArrowUturnLeftIcon className="h-5 w-5 mr-1" />
                  İadeyi Tekrar Dene
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Stuck partial-arrival panel — one item delivered, counterpart in transit */}
        {canForceCancelStuck && (
          <div className="bg-warning-50 border-2 border-warning-400 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ClockIcon className="h-8 w-8 text-warning-700 flex-shrink-0" />
                <div>
                  <h2 className="text-lg font-semibold text-warning-900">
                    Sıkışmış Takas
                  </h2>
                  <p className="text-sm text-warning-800 mt-1">
                    Bir ürün depoya ulaştı ({new Date(trade.firstWarehouseArrivalAt!).toLocaleString('tr-TR')}) ama
                    karşı tarafın kargosu hâlâ yolda. Manuel müdahale gerekiyor:
                    karşı kargoyu iptal edip ulaşan ürünü sahibine geri yollayabilirsin.
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <Button
                  variant="danger"
                  onClick={() => setShowForceCancelModal(true)}
                >
                  Sıkışmış Takası Çöz
                </Button>
              </div>
            </div>
          </div>
        )}

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
          <div className="bg-surface-elevated rounded-xl shadow-sm p-4 flex items-center justify-between">
            <span className="font-medium text-heading">Nakit Fark</span>
            <span className="text-lg font-semibold text-primary-600">
              +₺{Number(trade.cashAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Parties and items */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Initiator */}
          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
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
              <p className="text-sm text-muted">{trade.initiator.email}</p>
            </div>
            <div className="space-y-3">
              <h3 className="font-medium text-heading">Teklif Edilen Ürünler:</h3>
              {initiatorItems.map((item) => (
                <div key={item.id} className="flex gap-3 p-3 bg-surface rounded-lg">
                  {item.product.images && item.product.images.length > 0 && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-surface-alt flex-shrink-0">
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
                    <p className="text-xs text-muted">
                      ₺{getProductEffectivePrice(item.product).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Receiver */}
          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
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
              <p className="text-sm text-muted">{trade.receiver.email}</p>
            </div>
            <div className="space-y-3">
              <h3 className="font-medium text-heading">Karşılık Verilen Ürünler:</h3>
              {receiverItems.map((item) => (
                <div key={item.id} className="flex gap-3 p-3 bg-surface rounded-lg">
                  {item.product.images && item.product.images.length > 0 && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-surface-alt flex-shrink-0">
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
                    <p className="text-xs text-muted">
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
                secondaryActionLabel={isReturning ? 'Kayıp İşaretle' : undefined}
                onSecondaryAction={isReturning ? setMarkLostShipmentId : undefined}
              />
            )}
          </div>
        )}

        {/* Rejection / cancellation reason */}
        {(trade.rejectionReason || trade.cancellationReason || trade.cancelReason) && (
          <div className="bg-danger-50 border border-danger-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-danger-900 mb-2 flex items-center gap-2">
              <XCircleIcon className="w-5 h-5" />
              {trade.rejectionReason ? 'Red Sebebi' : 'İptal Sebebi'}
            </h2>
            {(() => {
              const raw =
                trade.rejectionReason ||
                trade.cancellationReason ||
                trade.cancelReason;
              const short = trade.rejectionReason
                ? null
                : cancelReasonLabel(trade.cancellationReason || trade.cancelReason);
              return (
                <>
                  {short && short !== raw && (
                    <p className="text-sm font-medium text-danger-700 mb-1">{short}</p>
                  )}
                  <p className="text-sm text-danger-800 whitespace-pre-wrap">{raw}</p>
                </>
              );
            })()}
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
          <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
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
        <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
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
          <p className="text-sm text-body">
            Takas onaylandığında, her iki ürün de depodan alıcılara gönderilecek ve nakit fark
            alıcıya aktarılacaktır.
          </p>
          <div>
            <label className="block text-sm font-medium text-body mb-2">
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
          <p className="text-sm text-body">
            Takas reddedildiğinde, her iki ürün de sahiplerine iade edilecek ve alıcının ödediği
            nakit geri iade edilecektir.
          </p>
          <div>
            <label className="block text-sm font-medium text-body mb-2">
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
            <p className="mt-1 text-xs text-muted">
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
            <label className="block text-sm font-medium text-body mb-2">Çözüm</label>
            <Select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              disabled={processingResolve}
            >
              <option value="complete_trade">Takası Tamamla</option>
              <option value="cancel_trade">Takası İptal Et (iade tetiklenir)</option>
              <option value="compensate_initiator">
                Teklif Verene Tazminat (iptal + iade + tazminat işareti)
              </option>
              <option value="compensate_receiver">
                Teklif Alana Tazminat (iptal + iade + tazminat işareti)
              </option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-body mb-2">
              Çözüm Notu (en az 10 karakter)
            </label>
            <Textarea value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              rows={3}
              placeholder="Çözüm gerekçesini özetleyin (kargo kayıp, hasar, vs.)..."
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

      {/* Mark Return Lost Modal */}
      <Modal
        isOpen={!!markLostShipmentId}
        onClose={() =>
          !processingMarkLost && (setMarkLostShipmentId(null), setMarkLostReason(''))
        }
        title="İade Gönderisini Kayıp İşaretle"
      >
        <div className="space-y-4">
          <p className="text-sm text-body">
            Bu gönderi kayıp olarak işaretlenecek. Eğer her iki iade kargosu da
            çözümlendi sayılırsa (teslim veya kayıp) takas iptal edilir ve etkilenen
            kullanıcı için tazminat bekliyor olarak işaretlenir.
          </p>
          <div>
            <label className="block text-sm font-medium text-body mb-2">
              Kayıp Gerekçesi (en az 10 karakter)
            </label>
            <Textarea
              value={markLostReason}
              onChange={(e) => setMarkLostReason(e.target.value)}
              rows={3}
              placeholder="Örn. Kargo şubeden çıktıktan sonra teslim edilemedi, sürat takibinde kayıp"
              disabled={processingMarkLost}
            />
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setMarkLostShipmentId(null);
                setMarkLostReason('');
              }}
              disabled={processingMarkLost}
            >
              İptal
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleMarkReturnLost}
              isLoading={processingMarkLost}
            >
              Kayıp İşaretle
            </Button>
          </div>
        </div>
      </Modal>

      {/* Force-Cancel Stuck Modal */}
      <Modal
        isOpen={showForceCancelModal}
        onClose={() =>
          !processingForceCancel && setShowForceCancelModal(false)
        }
        title="Sıkışmış Takası Çöz"
      >
        <div className="space-y-4">
          <p className="text-sm text-body">
            Karşı tarafın kargosu Sürat'ta iptal edilecek. Ulaşan ürün (depoda)
            sahibine geri kargolanacak; nakit fark varsa ödeyen kişiye iade
            edilir.
          </p>
          <div>
            <label className="block text-sm font-medium text-body mb-2">
              İptal Gerekçesi (en az 10 karakter)
            </label>
            <Textarea
              value={forceCancelReason}
              onChange={(e) => setForceCancelReason(e.target.value)}
              rows={3}
              placeholder="Örn. Karşı tarafın kargosu 14 gündür sürat şubesinde sıkıştı, gelen ürünü sahibine iade ediyoruz"
              disabled={processingForceCancel}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-body">
            <input
              type="checkbox"
              checked={forceCancelSendBack}
              onChange={(e) => setForceCancelSendBack(e.target.checked)}
              disabled={processingForceCancel}
              className="rounded"
            />
            Ulaşan ürünü sahibine geri yolla (önerilen)
          </label>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowForceCancelModal(false)}
              disabled={processingForceCancel}
            >
              İptal
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleForceCancel}
              isLoading={processingForceCancel}
            >
              Sıkışmış Takası Çöz
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
  secondaryActionLabel?: string;
  onSecondaryAction?: (shipmentId: string) => void;
}

function ShipmentLegCard({
  title,
  icon,
  shipments,
  actionLabel,
  onAction,
  processingShipmentId,
  infoMessage,
  secondaryActionLabel,
  onSecondaryAction,
}: ShipmentLegCardProps) {
  return (
    <div className="bg-surface-elevated rounded-xl shadow-sm p-6">
      <h2 className="text-lg font-semibold text-heading mb-4 flex items-center gap-2">
        {icon}
        {title}
        <span className="text-sm font-normal text-muted">({shipments.length})</span>
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
                delivered ? 'bg-success-50 border-success-200' : 'bg-surface border-border',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1 text-sm">
                  {s.sender && (
                    <p>
                      <span className="font-medium text-body">Gönderen:</span>{' '}
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
                      <span className="font-medium text-body">Alıcı:</span>{' '}
                      <Link
                        href={`/users/${s.recipient.id}`}
                        className="text-primary-600 hover:underline"
                      >
                        {s.recipient.displayName}
                      </Link>
                      {s.recipientType && (
                        <span className="text-xs text-muted ml-1">({s.recipientType})</span>
                      )}
                    </p>
                  )}
                  {s.trackingNumber && (
                    <p>
                      <span className="font-medium text-body">Takip No:</span>{' '}
                      <span className="font-mono">{s.trackingNumber}</span>
                    </p>
                  )}
                  {s.carrier && (
                    <p>
                      <span className="font-medium text-body">Firma:</span> {s.carrier}
                    </p>
                  )}
                  {s.status && (
                    <p>
                      <span className="font-medium text-body">Durum:</span> {s.status}
                    </p>
                  )}
                  {s.shippedAt && (
                    <p className="text-xs text-muted">
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
                  {s.lostAt ? (
                    <span className="inline-flex items-center gap-1 text-danger-700 text-sm font-medium">
                      <XCircleIcon className="w-5 h-5" />
                      Kayıp
                    </span>
                  ) : delivered ? (
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
                    <span className="text-xs text-muted">Beklemede</span>
                  )}
                  {!s.lostAt && !delivered && secondaryActionLabel && onSecondaryAction && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSecondaryAction(s.id)}
                    >
                      {secondaryActionLabel}
                    </Button>
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
      <p className="text-xs text-muted">{new Date(date).toLocaleString('tr-TR')}</p>
    </div>
  );
}
