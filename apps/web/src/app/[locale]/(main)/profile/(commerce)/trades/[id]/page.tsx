/** @format */

"use client";

import { Badge, StatusBadge, tradeStatusConfig } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { getTradeStatusLabel } from "./_lib/types";
import { useTradeDetail } from "./_hooks/useTradeDetail";
import { viewerCanPay } from "./_lib/tradePayments";
import TradeProgressTimeline from "./_sections/TradeProgressTimeline";
import CompletedTradeSummary from "./_sections/CompletedTradeSummary";
import TradeCountdown from "./_sections/TradeCountdown";
import TradeInfoBanners from "./_sections/TradeInfoBanners";
import TradeItemsComparison from "./_sections/TradeItemsComparison";
import TradePaymentsCard from "./_sections/TradePaymentsCard";
import ShipInfoForm from "./_sections/ShipInfoForm";
import WarehouseShipmentCard from "./_sections/WarehouseShipmentCard";
import RecipientsShipmentCard from "./_sections/RecipientsShipmentCard";
import ReturnShipmentCard from "./_sections/ReturnShipmentCard";
import TradeMessages from "./_sections/TradeMessages";
import TradeActionBar from "./_sections/TradeActionBar";
import CounterOfferEditor from "./_sections/CounterOfferEditor";
import RejectTradeModal from "./_modals/RejectTradeModal";
import RaiseDisputeModal from "./_modals/RaiseDisputeModal";

export default function TradeDetailPage() {
  const vm = useTradeDetail();
  const {
    trade,
    quote,
    isLoading,
    tradeId,
    user,
    t,
    locale,
    countdown,
    statusMeta,
    isInitiator,
    canAccept,
    canReject,
    canCounter,
    canCancel,
    canDispute,
    showCancelDisabled,
    needToShip,
    myToWarehouseShipment,
    otherToWarehouseShipment,
    myFromWarehouseShipment,
    otherFromWarehouseShipment,
    myReturnShipment,
    addresses,
    addressesLoading,
    shipAddressId,
    setShipAddressId,
    isActionLoading,
    cashPaymentLoading,
    setTradeAddressId,
    showRejectModal,
    setShowRejectModal,
    rejectReason,
    setRejectReason,
    showDisputeModal,
    setShowDisputeModal,
    invalidateTrade,
    handleCashPayment,
    handleShipSubmit,
    handleConfirmReceipt,
    handleAccept,
    handleReject,
    handleCancel,
    handleOpenCounterModal,
    isCounterMode,
  } = vm;

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-surface py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-border-subtle rounded w-1/3" />
            <div className="card p-6">
              <div className="h-64 bg-border-subtle rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="min-h-dvh bg-surface py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="card p-6 text-center">
            <p className="text-muted">Takas bulunamadı</p>
            <ButtonLink href="/profile/trades" className="mt-4 inline-block">
              Takaslara Dön
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  // Counter-offer edit mode replaces the whole detail view.
  if (isCounterMode) {
    return <CounterOfferEditor vm={vm} />;
  }

  // Perspective: show "their" items on the left and "yours" on the right.
  const myItems = isInitiator ? trade.initiatorItems : trade.receiverItems;
  const theirItems = isInitiator ? trade.receiverItems : trade.initiatorItems;
  const theirName = isInitiator ? trade.receiverName : trade.initiatorName;

  // Ödeme aşamasında iptal düğmesini ödeme kartı gösterir; aksi halde aynı
  // düğme hem orada hem alttaki eylem çubuğunda çıkardı.
  const paymentCardOwnsCancel = viewerCanPay(trade, quote, user?.id);

  return (
    <PageShell className="pb-16">
      <PageHeader
        backHref="/profile/trades"
        title="Takas Detayı"
        description={
          <span className="inline-flex items-center gap-2">
            Takas No: {trade.tradeNumber}
            {trade.version && trade.version > 1 && (
              <Badge variant="primary" size="sm">
                {t("trade.counterOfferNumber", { number: trade.version - 1 })}
              </Badge>
            )}
          </span>
        }
        actions={
          <StatusBadge
            status={trade.status}
            config={tradeStatusConfig}
            label={getTradeStatusLabel(trade.status, locale)}
          />
        }
      />

      <div className="mb-6 rounded-lg border border-border bg-surface-alt p-4">
        <p className="text-sm text-muted">{statusMeta.description}</p>
        {(trade.status === "cancelled" || trade.status === "rejected") &&
          trade.cancelReason && (
            <p className="mt-2 text-sm text-muted">
              <span className="font-medium">{t("common.reason")}: </span>
              {trade.cancelReason}
            </p>
          )}
      </div>

      <TradeProgressTimeline trade={trade} />

      <CompletedTradeSummary
        trade={trade}
        locale={locale}
        t={t}
        userId={user?.id}
      />

      <TradeCountdown countdown={countdown} />

      <TradeInfoBanners trade={trade} t={t} />

      <TradeItemsComparison
        theirItems={theirItems}
        myItems={myItems}
        theirName={theirName}
        tradeId={tradeId}
      />

      {/*
        Ödeme aşamasındaki iptal düğmesi ödeme kartının İÇİNDE, öde düğmesinin
        yanında durur; TradeActionBar aynı düğmeyi ikinci bir kartta tekrar
        etmesin diye aşağıda `canCancel` bu durumda kapatılır.
      */}
      <TradePaymentsCard
        trade={trade}
        quote={quote}
        userId={user?.id}
        onPay={handleCashPayment}
        cashPaymentLoading={cashPaymentLoading}
        canCancel={!!canCancel}
        onCancel={handleCancel}
        isActionLoading={isActionLoading}
      />

      {needToShip && (
        <ShipInfoForm
          addresses={addresses}
          addressesLoading={addressesLoading}
          shipAddressId={shipAddressId}
          onShipAddressChange={setShipAddressId}
          onSubmit={handleShipSubmit}
          isActionLoading={isActionLoading}
        />
      )}

      <WarehouseShipmentCard
        trade={trade}
        userId={user?.id}
        myToWarehouseShipment={myToWarehouseShipment}
        otherToWarehouseShipment={otherToWarehouseShipment}
      />

      <RecipientsShipmentCard
        trade={trade}
        userId={user?.id}
        myFromWarehouseShipment={myFromWarehouseShipment}
        otherFromWarehouseShipment={otherFromWarehouseShipment}
        onConfirmReceipt={handleConfirmReceipt}
        isActionLoading={isActionLoading}
      />

      <ReturnShipmentCard trade={trade} myReturnShipment={myReturnShipment} />

      <TradeMessages trade={trade} />

      <TradeActionBar
        isActionLoading={isActionLoading}
        canAccept={!!canAccept}
        canReject={!!canReject}
        canCounter={!!canCounter}
        canCancel={!!canCancel && !paymentCardOwnsCancel}
        canDispute={!!canDispute}
        showCancelDisabled={!!showCancelDisabled}
        onAddressChange={setTradeAddressId}
        onAccept={handleAccept}
        onCounter={handleOpenCounterModal}
        onReject={() => setShowRejectModal(true)}
        onCancel={handleCancel}
        onDispute={() => setShowDisputeModal(true)}
      />

      <RejectTradeModal
        open={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setRejectReason("");
        }}
        reason={rejectReason}
        onReasonChange={setRejectReason}
        onReject={handleReject}
        isActionLoading={isActionLoading}
        cancelLabel={t("common.cancel")}
      />

      <RaiseDisputeModal
        open={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        tradeId={trade.id}
        onSuccess={invalidateTrade}
      />
    </PageShell>
  );
}
