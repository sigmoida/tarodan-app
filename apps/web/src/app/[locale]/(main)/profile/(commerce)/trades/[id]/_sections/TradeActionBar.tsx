/** @format */

import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import TradeAddressPicker from "../../_components/TradeAddressPicker";

interface TradeActionBarProps {
  isActionLoading: boolean;
  canAccept: boolean;
  canReject: boolean;
  canCounter: boolean;
  canCancel: boolean;
  canDispute: boolean;
  showCancelDisabled: boolean;
  onAddressChange: (id: string | null) => void;
  onAccept: () => void;
  onCounter: () => void;
  onReject: () => void;
  onCancel: () => void;
  onDispute: () => void;
}

export default function TradeActionBar({
  isActionLoading,
  canAccept,
  canReject,
  canCounter,
  canCancel,
  canDispute,
  showCancelDisabled,
  onAddressChange,
  onAccept,
  onCounter,
  onReject,
  onCancel,
  onDispute,
}: TradeActionBarProps) {
  const t = useTranslations();
  if (!(
    canAccept ||
    canReject ||
    canCounter ||
    canCancel ||
    canDispute ||
    showCancelDisabled
  ))
    return null;

  return (
    <div className="card p-6">
      {/* Kabul ederken teslimat adresi seçimi (kargo kabulde başlar) */}
      {canAccept && (
        <div className="mb-5">
          <TradeAddressPicker
            label={t("address.deliveryAddress")}
            onChange={onAddressChange}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {canAccept && (
          <Button
            variant="success"
            size="lg"
            className="flex-1 min-w-[120px]"
            onClick={onAccept}
            disabled={isActionLoading}
          >
            {isActionLoading
              ? t("checkout.processing")
              : t("trade.acceptTrade")}
          </Button>
        )}
        {canCounter && (
          <Button
            variant="primary"
            size="lg"
            className="flex-1 min-w-[120px]"
            onClick={onCounter}
            disabled={isActionLoading}
          >
            {t("trade.counterOffer")}
          </Button>
        )}
        {canReject && (
          <Button
            variant="secondary"
            size="lg"
            className="flex-1 min-w-[120px]"
            onClick={onReject}
            disabled={isActionLoading}
          >
            {t("trade.rejectTrade")}
          </Button>
        )}
        {canCancel && !canAccept && !canReject && (
          <Button
            variant="danger"
            size="lg"
            className="flex-1 min-w-[120px]"
            onClick={onCancel}
            disabled={isActionLoading}
          >
            {t("trade.cancelTradeAction")}
          </Button>
        )}
        {showCancelDisabled && !canAccept && !canReject && (
          <div className="flex-1 min-w-[120px] flex flex-col">
            <Button
              variant="secondary"
              size="lg"
              className="opacity-70 cursor-not-allowed"
              disabled
              title={t("trade.cancelLockedTooltip")}
            >
              {t("trade.cancelLocked")}
            </Button>
            <span className="text-xs text-muted mt-1">
              {t("trade.itemReachedWarehouse")}
            </span>
          </div>
        )}
        {/* İtiraz: ürünler depodan çıktıktan sonraki pencerede (kilitli iptal
            tooltip'inin işaret ettiği akış) — modal RaiseDisputeModal'da. */}
        {canDispute && (
          <div className="flex-1 min-w-[120px] flex flex-col">
            <Button
              variant="secondary"
              size="lg"
              onClick={onDispute}
              disabled={isActionLoading}
            >
              {t("trade.dispute.openCta")}
            </Button>
            <span className="text-xs text-muted mt-1">
              {t("trade.dispute.hint")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
