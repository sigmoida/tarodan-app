/** @format */

import { Button } from "@tarodan/ui";
import TradeAddressPicker from "@/components/TradeAddressPicker";

interface TradeActionBarProps {
  locale: string;
  isActionLoading: boolean;
  canAccept: boolean;
  canReject: boolean;
  canCounter: boolean;
  canCancel: boolean;
  showCancelDisabled: boolean;
  onAddressChange: (id: string | null) => void;
  onAccept: () => void;
  onCounter: () => void;
  onReject: () => void;
  onCancel: () => void;
}

export default function TradeActionBar({
  locale,
  isActionLoading,
  canAccept,
  canReject,
  canCounter,
  canCancel,
  showCancelDisabled,
  onAddressChange,
  onAccept,
  onCounter,
  onReject,
  onCancel,
}: TradeActionBarProps) {
  if (!(canAccept || canReject || canCounter || canCancel || showCancelDisabled))
    return null;

  return (
    <div className="card p-6">
      {/* Kabul ederken teslimat adresi seçimi (kargo kabulde başlar) */}
      {canAccept && (
        <div className="mb-5">
          <TradeAddressPicker
            label={locale === "en" ? "Delivery Address" : "Teslimat Adresi"}
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
              ? locale === "en"
                ? "Processing..."
                : "İşleniyor..."
              : locale === "en"
                ? "Accept"
                : "Kabul Et"}
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
            {locale === "en" ? "Counter Offer" : "Karşı Teklif"}
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
            {locale === "en" ? "Reject" : "Reddet"}
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
            {locale === "en" ? "Cancel Trade" : "İptal Et"}
          </Button>
        )}
        {showCancelDisabled && !canAccept && !canReject && (
          <div className="flex-1 min-w-[120px] flex flex-col">
            <Button
              variant="secondary"
              size="lg"
              className="opacity-70 cursor-not-allowed"
              disabled
              title={
                locale === "en"
                  ? "An item already reached the warehouse — cancel is no longer available. Open a dispute if needed."
                  : "Ürünlerden biri Tarodan deposuna ulaştı; iptal edilemez. Sorun varsa itiraz açın."
              }
            >
              {locale === "en" ? "Cancel Locked" : "İptal Edilemez"}
            </Button>
            <span className="text-xs text-muted mt-1">
              {locale === "en"
                ? "An item reached the warehouse."
                : "Ürünlerden biri depoya ulaştı."}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
