/** @format */

import type { Translate } from "@/types/i18n";

import {
  CheckCircleIcon,
  XCircleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import type { Trade } from "../_lib/types";

/**
 * The stacked informational status banners: the safe-trade notice (pending /
 * accepted / awaiting_payment), the warehouse-review notice, and the return
 * notice. Rendered in this fixed order to match the original page.
 */
export default function TradeInfoBanners({
  trade,
  locale,
  t,
}: {
  trade: Trade;
  locale: string;
  t: Translate;
}) {
  return (
    <>
      {/* Güvenli takas bilgisi - pending veya accepted durumunda */}
      {(trade.status === "pending" ||
        trade.status === "accepted" ||
        trade.status === "awaiting_payment") && (
        <div className="card p-4 mb-6 bg-info-50 border-info-200">
          <h3 className="font-semibold text-info-900 mb-2 flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 text-info-600" />
            {t("trade.safeTradeTitle")}
          </h3>
          <p className="text-sm text-info-800">{t("trade.safeTradeDesc")}</p>
        </div>
      )}

      {/* Safe-trade (escrow) warehouse info banner */}
      {(trade.status === "at_warehouse" ||
        trade.status === "admin_reviewing") && (
        <div className="card p-6 mb-6 bg-info-50 border-2 border-info-200">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-info-500 flex items-center justify-center">
              <ShieldCheckIcon className="w-7 h-7 text-inverted" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-info-900 mb-1">
                {locale === "en"
                  ? "Your items are at the Tarodan warehouse"
                  : "Ürünleriniz Tarodan Deposunda"}
              </h2>
              <p className="text-sm text-info-800">
                {locale === "en"
                  ? "Our team is reviewing the items. You will be notified once the review is complete."
                  : "Ekibimiz ürünleri inceliyor. İnceleme tamamlandığında bilgilendirileceksiniz."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Returning banner */}
      {trade.status === "returning" && (
        <div className="card p-6 mb-6 bg-warning-50 border-2 border-warning-200">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-warning-500 flex items-center justify-center">
              <XCircleIcon className="w-7 h-7 text-inverted" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-warning-900 mb-1">
                {locale === "en"
                  ? "Trade rejected by admin"
                  : "Takas reddedildi"}
              </h2>
              {trade.cancelReason && (
                <p className="text-sm text-warning-800 mb-2">
                  <span className="font-medium">{t("common.reason")}: </span>
                  {trade.cancelReason}
                </p>
              )}
              <p className="text-sm text-warning-800">
                {locale === "en"
                  ? "Your items are being returned to you."
                  : "Ürünleriniz size iade ediliyor."}
              </p>
              {(trade.cashRefundedAt || trade.cashPayment?.refundedAt) && (
                <p className="text-sm text-success-700 mt-2 font-medium">
                  {locale === "en"
                    ? "Cash has been refunded"
                    : "Nakit iade edildi"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
