/** @format */

import type { Translate } from "@/types/i18n";

import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { ButtonLink } from "@/components/ui";
import { formatTL } from "@/lib/format";
import type { Trade } from "../_lib/types";
import { buildTradePaymentPanels } from "../_lib/tradePayments";

/** BCP-47 date-format locale for the active UI language. */
const DATE_LOCALES: Record<string, string> = { en: "en-US", tr: "tr-TR" };

export default function CompletedTradeSummary({
  trade,
  locale,
  t,
  userId,
}: {
  trade: Trade;
  locale: string;
  t: Translate;
  userId?: string;
}) {
  if (trade.status !== "completed") return null;

  // Tamamlanan takasta kullanıcı "ne ödedim" sorusunun cevabını burada arar;
  // ödeme kartı bu aşamada aksiyon içermediği için döküm özete taşınır.
  const myPanel = buildTradePaymentPanels(trade, null, userId).find(
    (panel) => panel.isViewer,
  );
  const paidLines = myPanel
    ? (
        [
          [t("trade.serviceFee"), myPanel.serviceFee],
          [t("trade.shippingFee"), myPanel.shipping],
          [t("trade.cashDifferenceLine"), myPanel.cashDifference],
          [t("trade.commissionLine"), myPanel.commission],
        ] as const
      ).filter(([, amount]) => amount > 0)
    : [];

  const fmtDate = (iso?: string) =>
    iso
      ? new Date(iso).toLocaleDateString(DATE_LOCALES[locale] ?? "tr-TR", {
          dateStyle: "medium",
        })
      : "—";

  return (
    <div className="card p-6 mb-6 bg-surface-alt border border-border rounded-xl">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-surface flex items-center justify-center">
          <CheckCircleIcon className="w-7 h-7 text-success-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-heading mb-1">
            {t("trade.completedSummaryTitle")}
          </h2>
          <p className="text-muted text-sm mb-4">
            {t("trade.completedSummaryDesc")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-surface-elevated/60 rounded-lg px-3 py-2">
              <p className="text-xs font-medium text-success-700 uppercase tracking-wide">
                {t("trade.createdAt")}
              </p>
              <p className="text-sm font-semibold text-heading">
                {fmtDate(trade.createdAt)}
              </p>
            </div>
            {trade.acceptedAt && (
              <div className="bg-surface-elevated/60 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-success-700 uppercase tracking-wide">
                  {t("trade.acceptedAt")}
                </p>
                <p className="text-sm font-semibold text-heading">
                  {fmtDate(trade.acceptedAt)}
                </p>
              </div>
            )}
            {trade.completedAt && (
              <div className="bg-surface-elevated/60 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-success-700 uppercase tracking-wide">
                  {t("trade.completedAt")}
                </p>
                <p className="text-sm font-semibold text-heading">
                  {fmtDate(trade.completedAt)}
                </p>
              </div>
            )}
          </div>
          {paidLines.length > 0 && myPanel && (
            <div className="mb-4 rounded-lg border border-border bg-surface-elevated/60 px-4 py-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-success-700">
                {t("trade.paymentsSummaryTitle")}
              </p>
              <div className="space-y-1">
                {paidLines.map(([label, amount]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted">{label}</span>
                    <span className="font-medium text-body">
                      {formatTL(amount)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border pt-1 text-sm">
                  <span className="font-semibold text-heading">
                    {t("trade.paymentTotal")}
                  </span>
                  <span className="font-bold text-heading">
                    {formatTL(myPanel.total)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/profile/trades" variant="primary" size="sm">
              {t("trade.backToTrades")}
            </ButtonLink>
            <ButtonLink href="/listings" variant="outline" size="sm">
              {t("trade.browseListings")}
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
