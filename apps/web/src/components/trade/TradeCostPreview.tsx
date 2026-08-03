/** @format */

import { Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { formatTL } from "@/lib/format";
import type {
  TradeQuotePreview,
  TradeQuotePreviewParty,
} from "@/hooks/useTradeCostPreview";

interface TradeCostPreviewProps {
  preview: TradeQuotePreview | null;
  loading: boolean;
  failed: boolean;
  /** Sol sütun başlığı — teklifi kuran taraf. */
  youLabel?: string;
  /** Sağ sütun başlığı — karşı taraf. */
  themLabel?: string;
}

function PreviewColumn({
  title,
  party,
}: {
  title: string;
  party: TradeQuotePreviewParty;
}) {
  const t = useTranslations();
  const lines = (
    [
      [t("trade.serviceFee"), party.serviceFee],
      [t("trade.shippingFee"), party.shipping],
      [t("trade.cashDifferenceLine"), party.cashDifference],
    ] as const
  ).filter(([, amount]) => amount > 0);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="mb-2 text-sm font-semibold text-heading">{title}</p>
      <div className="space-y-1">
        {lines.map(([label, amount]) => (
          <div
            key={label}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-muted">{label}</span>
            <span className="font-medium text-body">{formatTL(amount)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <span className="text-sm font-semibold text-heading">
          {t("trade.paymentTotal")}
        </span>
        <span className="font-bold text-primary-600">
          {formatTL(party.total)}
        </span>
      </div>
    </div>
  );
}

/**
 * Kurulmakta olan teklifin iki taraf için maliyeti.
 *
 * v2'de takasın bedeli ürünlere bağlıdır (ürün başına hizmet bedeli + tarafın
 * birleşik desisine göre kargo), bu yüzden kullanıcı seçimi değiştirdikçe fiyat
 * da değişir — teklifi gönderdikten sonra öğrenmemeli.
 */
export default function TradeCostPreview({
  preview,
  loading,
  failed,
  youLabel,
  themLabel,
}: TradeCostPreviewProps) {
  const t = useTranslations();
  if (failed) {
    return (
      <div className="mb-6 rounded-xl border border-border bg-surface-elevated p-6">
        <p className="text-sm text-muted">{t("trade.costPreviewFailed")}</p>
      </div>
    );
  }
  if (!preview) {
    return loading ? (
      <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-surface-elevated p-6">
        <Spinner size="sm" color="border-primary-500 border-t-transparent" />
        <p className="text-sm text-muted">{t("trade.costPreviewTitle")}</p>
      </div>
    ) : null;
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface-elevated p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-heading">
          {t("trade.costPreviewTitle")}
        </h2>
        {loading && (
          <Spinner size="sm" color="border-primary-500 border-t-transparent" />
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PreviewColumn
          title={youLabel ?? t("trade.costPreviewYou")}
          party={preview.initiator}
        />
        <PreviewColumn
          title={themLabel ?? t("trade.costPreviewThem")}
          party={preview.receiver}
        />
      </div>
      <p className="mt-3 text-xs text-subtle">{t("trade.costPreviewHint")}</p>
    </div>
  );
}
