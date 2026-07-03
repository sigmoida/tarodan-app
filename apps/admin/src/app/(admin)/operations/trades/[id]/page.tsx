'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, StatusBadge, tradeStatusConfig } from '@tarodan/ui';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/provider/ConfirmProvider';
import { useAdminMutation } from '@/hooks/useAdminMutation';
import { DetailPage } from '@/components/detail/DetailPage';
import { Timeline } from '@/components/detail/Timeline';
import type { TradeDetail } from './types';
import { groupShipmentsByLeg, mapTradePayload } from './_lib/trade';
import { CompensationPanel } from './_sections/CompensationPanel';
import { RefundFailurePanel } from './_sections/RefundFailurePanel';
import { StuckPanel } from './_sections/StuckPanel';
import { ReviewPanel } from './_sections/ReviewPanel';
import { TradeInfoCards } from './_sections/TradeInfoCards';
import { TradePartyCard } from './_components/TradePartyCard';
import { ShipmentLegCard } from './_components/ShipmentLegCard';
import { ApproveTradeModal } from './_modals/ApproveTradeModal';
import { RejectTradeModal } from './_modals/RejectTradeModal';
import { ResolveDisputeModal } from './_modals/ResolveDisputeModal';
import { MarkReturnLostModal } from './_modals/MarkReturnLostModal';
import { ForceCancelModal } from './_modals/ForceCancelModal';

export default function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const confirm = useConfirm();

  // Modal open states
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const [showForceCancel, setShowForceCancel] = useState(false);
  const [markLostShipmentId, setMarkLostShipmentId] = useState<string | null>(null);

  // Shipment actions (direct mutations, triggered from ShipmentLegCard).
  const warehouse = useAdminMutation(
    (shipmentId: string) => adminApi.markWarehouseReceived(id, shipmentId),
    { invalidates: ['trades'], successMessage: 'Gönderi depoya ulaştı olarak işaretlendi' },
  );
  const returnDelivered = useAdminMutation(
    (shipmentId: string) => adminApi.markReturnDelivered(id, shipmentId),
    { invalidates: ['trades'], successMessage: 'İade gönderisi teslim edildi olarak işaretlendi' },
  );
  const processingShipmentId: string | null = warehouse.isPending
    ? warehouse.variables ?? null
    : returnDelivered.isPending
      ? returnDelivered.variables ?? null
      : null;

  const handleMarkWarehouse = async (shipmentId: string) => {
    if (!(await confirm({ description: 'Bu gönderinin depoya ulaştığını onaylıyor musunuz?', destructive: true })))
      return;
    warehouse.mutate(shipmentId);
  };
  const handleMarkReturnDelivered = async (shipmentId: string) => {
    if (!(await confirm({ description: 'Bu iade gönderisinin teslim edildiğini onaylıyor musunuz?', destructive: true })))
      return;
    returnDelivered.mutate(shipmentId);
  };

  return (
    <DetailPage<TradeDetail>
      resource="trades"
      id={id}
      fetcher={(tid) => adminApi.getTrade(tid).then((r) => mapTradePayload(r.data?.data ?? r.data))}
      backHref="/operations/trades"
      emptyTitle="Takas bulunamadı"
      title={(trade) => (
        <>
          Takas Detayı
          {trade.tradeNumber && (
            <span className="ml-3 font-mono text-base text-muted">{trade.tradeNumber}</span>
          )}
        </>
      )}
      subtitle={(trade) => `Oluşturulma: ${new Date(trade.createdAt).toLocaleString('tr-TR')}`}
      badge={(trade) => <StatusBadge status={trade.status} config={tradeStatusConfig} />}
      actions={(trade) =>
        trade.status === 'disputed' ? (
          <Button variant="primary" onClick={() => setShowResolve(true)}>
            Çözümle
          </Button>
        ) : undefined
      }
    >
      {(trade) => {
        const legs = groupShipmentsByLeg(trade.shipments || []);
        const toWarehouse = legs['to_warehouse'] || [];
        const fromWarehouse = legs['from_warehouse'] || [];
        const returns = legs['return'] || [];
        const canMarkWarehouse = trade.status === 'shipping_to_warehouse';
        const canApproveReject = trade.status === 'at_warehouse' || trade.status === 'admin_reviewing';
        const isShippingToRecipients = trade.status === 'shipping_to_recipients';
        const isReturning = trade.status === 'returning';
        const canForceCancelStuck =
          trade.status === 'shipping_to_warehouse' &&
          !!trade.firstWarehouseArrivalAt &&
          toWarehouse.some((s) => !s.deliveredAt);

        return (
          <>
            <CompensationPanel trade={trade} />
            <RefundFailurePanel trade={trade} />
            <StuckPanel trade={trade} show={canForceCancelStuck} onResolve={() => setShowForceCancel(true)} />
            <ReviewPanel
              show={canApproveReject}
              onApprove={() => setShowApprove(true)}
              onReject={() => setShowReject(true)}
            />

            {trade.cashAmount && trade.cashAmount > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-surface-elevated p-4 shadow-sm">
                <span className="font-medium text-heading">Nakit Fark</span>
                <span className="text-lg font-semibold text-primary-600">
                  +₺{Number(trade.cashAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <TradePartyCard
                title="Teklif Veren"
                itemsTitle="Teklif Edilen Ürünler:"
                user={trade.initiator}
                items={trade.initiatorItems}
              />
              <TradePartyCard
                title="Teklif Alan"
                itemsTitle="Karşılık Verilen Ürünler:"
                user={trade.receiver}
                items={trade.receiverItems}
              />
            </div>

            {trade.shipments && trade.shipments.length > 0 && (
              <div className="space-y-6">
                {toWarehouse.length > 0 && (
                  <ShipmentLegCard
                    title="Depoya Giden Gönderiler"
                    shipments={toWarehouse}
                    actionLabel={canMarkWarehouse ? 'Depoya Ulaştı' : null}
                    onAction={canMarkWarehouse ? handleMarkWarehouse : null}
                    processingShipmentId={processingShipmentId}
                  />
                )}
                {fromWarehouse.length > 0 && (
                  <ShipmentLegCard
                    title="Depodan Alıcılara Gönderiler"
                    shipments={fromWarehouse}
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
                {returns.length > 0 && (
                  <ShipmentLegCard
                    title="İade Gönderileri"
                    shipments={returns}
                    actionLabel={isReturning ? 'Teslim Edildi' : null}
                    onAction={isReturning ? handleMarkReturnDelivered : null}
                    processingShipmentId={processingShipmentId}
                    secondaryActionLabel={isReturning ? 'Kayıp İşaretle' : undefined}
                    onSecondaryAction={isReturning ? setMarkLostShipmentId : undefined}
                  />
                )}
              </div>
            )}

            <TradeInfoCards trade={trade} />

            <Timeline
              items={[
                { label: 'Oluşturulma', at: trade.createdAt },
                { label: 'Kabul Edildi', at: trade.acceptedAt },
                { label: 'Depoya Ulaştı', at: trade.warehouseReceivedAt },
                { label: 'Onaylandı', at: trade.approvedAt },
                { label: 'Reddedildi', at: trade.rejectedAt },
                { label: 'Tamamlandı', at: trade.completedAt },
                { label: 'İptal', at: trade.cancelledAt },
              ]}
            />

            <ApproveTradeModal open={showApprove} onClose={() => setShowApprove(false)} tradeId={id} />
            <RejectTradeModal open={showReject} onClose={() => setShowReject(false)} tradeId={id} />
            <ResolveDisputeModal open={showResolve} onClose={() => setShowResolve(false)} tradeId={id} />
            <ForceCancelModal open={showForceCancel} onClose={() => setShowForceCancel(false)} tradeId={id} />
            <MarkReturnLostModal
              shipmentId={markLostShipmentId}
              onClose={() => setMarkLostShipmentId(null)}
              tradeId={id}
            />
          </>
        );
      }}
    </DetailPage>
  );
}
