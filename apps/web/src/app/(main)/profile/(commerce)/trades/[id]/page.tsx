"use client";

import { ButtonLink } from "@/components/ui/ButtonLink";
import { useTradeDetail } from "./_hooks/useTradeDetail";
import TradeDetailHeader from "./_sections/TradeDetailHeader";
import TradeProgressTimeline from "./_sections/TradeProgressTimeline";
import CompletedTradeSummary from "./_sections/CompletedTradeSummary";
import TradeCountdown from "./_sections/TradeCountdown";
import TradeInfoBanners from "./_sections/TradeInfoBanners";
import TradeItemsComparison from "./_sections/TradeItemsComparison";
import CashDifferenceCard from "./_sections/CashDifferenceCard";
import ShipInfoForm from "./_sections/ShipInfoForm";
import WarehouseShipmentCard from "./_sections/WarehouseShipmentCard";
import RecipientsShipmentCard from "./_sections/RecipientsShipmentCard";
import ReturnShipmentCard from "./_sections/ReturnShipmentCard";
import TradeMessages from "./_sections/TradeMessages";
import TradeActionBar from "./_sections/TradeActionBar";
import CounterOfferEditor from "./_sections/CounterOfferEditor";
import RejectTradeModal from "./_modals/RejectTradeModal";

export default function TradeDetailPage() {
  const vm = useTradeDetail();
  const {
    trade,
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
      <div className="min-h-screen bg-surface py-8">
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
      <div className="min-h-screen bg-surface py-8">
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

  return (
    <div className="min-h-screen bg-surface py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <TradeDetailHeader
          trade={trade}
          locale={locale}
          description={statusMeta.description}
        />

        <TradeProgressTimeline trade={trade} locale={locale} />

        <CompletedTradeSummary trade={trade} locale={locale} t={t} />

        <TradeCountdown countdown={countdown} />

        <TradeInfoBanners trade={trade} locale={locale} t={t} />

        <TradeItemsComparison
          theirItems={theirItems}
          myItems={myItems}
          theirName={theirName}
          tradeId={tradeId}
        />

        <CashDifferenceCard
          trade={trade}
          userId={user?.id}
          locale={locale}
          onPay={handleCashPayment}
          cashPaymentLoading={cashPaymentLoading}
        />

        {needToShip && (
          <ShipInfoForm
            locale={locale}
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
          locale={locale}
          myToWarehouseShipment={myToWarehouseShipment}
          otherToWarehouseShipment={otherToWarehouseShipment}
        />

        <RecipientsShipmentCard
          trade={trade}
          userId={user?.id}
          locale={locale}
          myFromWarehouseShipment={myFromWarehouseShipment}
          otherFromWarehouseShipment={otherFromWarehouseShipment}
          onConfirmReceipt={handleConfirmReceipt}
          isActionLoading={isActionLoading}
        />

        <ReturnShipmentCard
          trade={trade}
          locale={locale}
          myReturnShipment={myReturnShipment}
        />

        <TradeMessages trade={trade} />

        <TradeActionBar
          locale={locale}
          isActionLoading={isActionLoading}
          canAccept={!!canAccept}
          canReject={!!canReject}
          canCounter={!!canCounter}
          canCancel={!!canCancel}
          showCancelDisabled={!!showCancelDisabled}
          onAddressChange={setTradeAddressId}
          onAccept={handleAccept}
          onCounter={handleOpenCounterModal}
          onReject={() => setShowRejectModal(true)}
          onCancel={handleCancel}
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
          locale={locale}
          cancelLabel={t("common.cancel")}
        />
      </div>
    </div>
  );
}
