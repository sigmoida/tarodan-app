"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button, StatusBadge, tradeStatusConfig } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { adminApi } from "@/lib/api";
import { useConfirm } from "@/provider/ConfirmProvider";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { DetailPage } from "@/components/detail/DetailPage";
import { Timeline } from "@/components/detail/Timeline";
import type { TradeDetail } from "./types";
import {
  groupShipmentsByLeg,
  mapTradePayload,
  productsByShipment,
} from "./_lib/trade";
import { CompensationPanel } from "./_sections/CompensationPanel";
import { RefundFailurePanel } from "./_sections/RefundFailurePanel";
import { EscrowReleasePanel } from "./_sections/EscrowReleasePanel";
import { StuckPanel } from "./_sections/StuckPanel";
import { ReviewPanel } from "./_sections/ReviewPanel";
import { TradeInfoCards } from "./_sections/TradeInfoCards";
import { TradeBalanceCard } from "./_sections/TradeBalanceCard";
import { TradePartyCard } from "./_components/TradePartyCard";
import { ShipmentLegCard } from "./_components/ShipmentLegCard";
import { ApproveTradeModal } from "./_modals/ApproveTradeModal";
import { RejectTradeModal } from "./_modals/RejectTradeModal";
import { ResolveDisputeModal } from "./_modals/ResolveDisputeModal";
import { MarkReturnLostModal } from "./_modals/MarkReturnLostModal";
import { ForceCancelModal } from "./_modals/ForceCancelModal";
import { statusConfig } from "@/lib/statusLabels";

export default function TradeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const confirm = useConfirm();

  // Modal open states
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showResolve, setShowResolve] = useState(false);
  const [showForceCancel, setShowForceCancel] = useState(false);
  const [markLostShipmentId, setMarkLostShipmentId] = useState<string | null>(
    null,
  );

  // Shipment actions (direct mutations, triggered from ShipmentLegCard).
  const warehouse = useAdminMutation(
    (shipmentId: string) => adminApi.markWarehouseReceived(id, shipmentId),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.warehouseReceivedMsg"),
    },
  );
  const returnDelivered = useAdminMutation(
    (shipmentId: string) => adminApi.markReturnDelivered(id, shipmentId),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.returnDeliveredMsg"),
    },
  );
  // Taşıyıcı teslimi hiç raporlamazsa escrow onay penceresi başlamaz; operasyon
  // fiziksel teslimi doğrulayıp elle işaretler.
  const outboundDelivered = useAdminMutation(
    (shipmentId: string) => adminApi.markOutboundDelivered(id, shipmentId),
    {
      invalidates: ["trades"],
      successMessage: t("admin.operations.trades.outboundDeliveredMsg"),
    },
  );
  // Depo kontrolünü üstlen (at_warehouse -> admin_reviewing).
  const startReview = useAdminMutation(() => adminApi.startTradeReview(id), {
    invalidates: ["trades"],
    successMessage: t("admin.operations.trades.reviewStartedMsg"),
  });

  const processingShipmentId: string | null = warehouse.isPending
    ? (warehouse.variables ?? null)
    : returnDelivered.isPending
      ? (returnDelivered.variables ?? null)
      : outboundDelivered.isPending
        ? (outboundDelivered.variables ?? null)
        : null;

  const handleMarkWarehouse = async (shipmentId: string) => {
    await confirm({
      description: t("admin.operations.trades.confirmWarehouse"),
      destructive: true,
      onConfirm: () => warehouse.mutateAsync(shipmentId),
    });
  };
  const handleMarkOutboundDelivered = async (shipmentId: string) => {
    await confirm({
      description: t("admin.operations.trades.confirmOutboundDelivered"),
      destructive: true,
      onConfirm: () => outboundDelivered.mutateAsync(shipmentId),
    });
  };
  const handleMarkReturnDelivered = async (shipmentId: string) => {
    await confirm({
      description: t("admin.operations.trades.confirmReturnDelivered"),
      destructive: true,
      onConfirm: () => returnDelivered.mutateAsync(shipmentId),
    });
  };

  return (
    <DetailPage<TradeDetail>
      resource="trades"
      id={id}
      fetcher={(tid) =>
        adminApi
          .getTrade(tid)
          .then((r) => mapTradePayload(r.data?.data ?? r.data))
      }
      backHref="/operations/trades"
      emptyTitle={t("admin.operations.trades.notFound")}
      title={(trade) => (
        <>
          {t("admin.operations.trades.detailTitle")}
          {trade.tradeNumber && (
            <span className="ml-2">#{trade.tradeNumber}</span>
          )}
        </>
      )}
      subtitle={(trade) =>
        t("admin.operations.trades.createdAtLabel", {
          date: new Date(trade.createdAt).toLocaleString("tr-TR"),
        })
      }
      badge={(trade) => (
        <StatusBadge
          status={trade.status}
          config={statusConfig(tradeStatusConfig, t)}
        />
      )}
      actions={(trade) =>
        trade.status === "disputed" ? (
          <Button variant="primary" onClick={() => setShowResolve(true)}>
            {t("admin.operations.trades.resolve")}
          </Button>
        ) : undefined
      }
    >
      {(trade) => {
        const legs = groupShipmentsByLeg(trade.shipments || []);
        const toWarehouse = legs["to_warehouse"] || [];
        const fromWarehouse = legs["from_warehouse"] || [];
        const returns = legs["return"] || [];
        const shipmentProducts = productsByShipment(trade);
        const canMarkWarehouse = trade.status === "shipping_to_warehouse";
        const canApproveReject =
          trade.status === "at_warehouse" || trade.status === "admin_reviewing";
        const isShippingToRecipients =
          trade.status === "shipping_to_recipients";
        const isReturning = trade.status === "returning";
        const canForceCancelStuck =
          trade.status === "shipping_to_warehouse" &&
          !!trade.firstWarehouseArrivalAt &&
          toWarehouse.some((s) => !s.deliveredAt);

        return (
          <>
            <CompensationPanel trade={trade} />
            <RefundFailurePanel trade={trade} />
            <EscrowReleasePanel trade={trade} />
            <StuckPanel
              trade={trade}
              show={canForceCancelStuck}
              onResolve={() => setShowForceCancel(true)}
            />
            <ReviewPanel
              show={canApproveReject}
              underReview={trade.status === "admin_reviewing"}
              onStartReview={() => startReview.mutate(undefined as never)}
              startingReview={startReview.isPending}
              onApprove={() => setShowApprove(true)}
              onReject={() => setShowReject(true)}
            />

            <TradeBalanceCard trade={trade} />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <TradePartyCard
                title={t("admin.operations.trades.offerer")}
                itemsTitle={t("admin.operations.trades.offeredItems")}
                user={trade.initiator}
                items={trade.initiatorItems}
              />
              <TradePartyCard
                title={t("admin.operations.trades.offerReceiver")}
                itemsTitle={t("admin.operations.trades.counterItems")}
                user={trade.receiver}
                items={trade.receiverItems}
              />
            </div>

            {trade.shipments && trade.shipments.length > 0 && (
              <div className="space-y-6">
                {toWarehouse.length > 0 && (
                  <ShipmentLegCard
                    title={t("admin.operations.trades.legToWarehouse")}
                    shipments={toWarehouse}
                    actionLabel={
                      canMarkWarehouse
                        ? t("admin.operations.trades.markWarehouseArrived")
                        : null
                    }
                    onAction={canMarkWarehouse ? handleMarkWarehouse : null}
                    processingShipmentId={processingShipmentId}
                    productsByShipmentId={shipmentProducts}
                  />
                )}
                {fromWarehouse.length > 0 && (
                  <ShipmentLegCard
                    title={t("admin.operations.trades.legFromWarehouse")}
                    shipments={fromWarehouse}
                    actionLabel={
                      isShippingToRecipients
                        ? t("admin.operations.trades.markOutboundDelivered")
                        : null
                    }
                    onAction={
                      isShippingToRecipients
                        ? handleMarkOutboundDelivered
                        : null
                    }
                    processingShipmentId={processingShipmentId}
                    productsByShipmentId={shipmentProducts}
                    infoMessage={
                      isShippingToRecipients
                        ? t("admin.operations.trades.recipientsWillConfirm")
                        : undefined
                    }
                  />
                )}
                {returns.length > 0 && (
                  <ShipmentLegCard
                    title={t("admin.operations.trades.legReturns")}
                    shipments={returns}
                    actionLabel={
                      isReturning
                        ? t("admin.operations.common.delivered")
                        : null
                    }
                    onAction={isReturning ? handleMarkReturnDelivered : null}
                    processingShipmentId={processingShipmentId}
                    productsByShipmentId={shipmentProducts}
                    secondaryActionLabel={
                      isReturning
                        ? t("admin.operations.trades.markLost")
                        : undefined
                    }
                    onSecondaryAction={
                      isReturning ? setMarkLostShipmentId : undefined
                    }
                  />
                )}
              </div>
            )}

            <TradeInfoCards trade={trade} />

            <Timeline
              items={[
                {
                  label: t("admin.operations.common.createdAt"),
                  at: trade.createdAt,
                },
                {
                  label: t("admin.operations.trades.timeline.accepted"),
                  at: trade.acceptedAt,
                },
                {
                  label: t(
                    "admin.operations.trades.timeline.warehouseReceived",
                  ),
                  at: trade.warehouseReceivedAt,
                },
                {
                  label: t("admin.operations.trades.timeline.approved"),
                  at: trade.approvedAt,
                },
                {
                  label: t("admin.operations.trades.timeline.rejected"),
                  at: trade.rejectedAt,
                },
                {
                  label: t("admin.operations.trades.timeline.completed"),
                  at: trade.completedAt,
                },
                {
                  label: t("admin.operations.trades.timeline.cancelled"),
                  at: trade.cancelledAt,
                },
              ]}
            />

            <ApproveTradeModal
              open={showApprove}
              onClose={() => setShowApprove(false)}
              tradeId={id}
            />
            <RejectTradeModal
              open={showReject}
              onClose={() => setShowReject(false)}
              tradeId={id}
            />
            <ResolveDisputeModal
              open={showResolve}
              onClose={() => setShowResolve(false)}
              tradeId={id}
            />
            <ForceCancelModal
              open={showForceCancel}
              onClose={() => setShowForceCancel(false)}
              tradeId={id}
            />
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
