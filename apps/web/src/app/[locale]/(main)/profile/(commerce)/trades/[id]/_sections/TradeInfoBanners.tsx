/** @format */

import type { Translate } from "@/types/i18n";

import {
  CheckCircleIcon,
  XCircleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { Alert } from "@tarodan/ui";
import type { Trade } from "../_lib/types";
import { paymentRowsOf } from "../_lib/tradePayments";

/**
 * The stacked informational status banners: the safe-trade notice (pending /
 * accepted / awaiting_payment), the warehouse-review notice, and the return
 * notice. Rendered in this fixed order to match the original page.
 */
export default function TradeInfoBanners({
  trade,
  t,
}: {
  trade: Trade;
  t: Translate;
}) {
  return (
    <>
      {/* Güvenli takas bilgisi - pending veya accepted durumunda */}
      {(trade.status === "pending" ||
        trade.status === "accepted" ||
        trade.status === "awaiting_payment") && (
        <Alert
          variant="default"
          icon={<CheckCircleIcon className="h-5 w-5 text-muted" />}
          title={t("trade.safeTradeTitle")}
          className="mb-6"
        >
          <p className="text-muted">{t("trade.safeTradeDesc")}</p>
        </Alert>
      )}

      {/* Safe-trade (escrow) warehouse info banner */}
      {(trade.status === "at_warehouse" ||
        trade.status === "admin_reviewing") && (
        <Alert
          variant="default"
          icon={<ShieldCheckIcon className="h-5 w-5 text-muted" />}
          title={t("trade.warehouseBannerTitle")}
          className="mb-6"
        >
          <p className="text-muted">{t("trade.warehouseBannerDesc")}</p>
        </Alert>
      )}

      {/* Returning banner */}
      {trade.status === "returning" && (
        <Alert
          variant="warning"
          icon={<XCircleIcon className="h-5 w-5 text-warning-600" />}
          title={t("trade.returningBannerTitle")}
          className="mb-6"
        >
          {trade.cancelReason && (
            <p className="mb-2 text-warning-800">
              <span className="font-medium">{t("common.reason")}: </span>
              {trade.cancelReason}
            </p>
          )}
          <p className="text-warning-800">{t("trade.returningBannerDesc")}</p>
          {/* v2'de iki satır var: herhangi biri iade edildiyse bilgilendir. */}
          {(trade.cashRefundedAt ||
            paymentRowsOf(trade).some((row) => row.refundedAt)) && (
            <p className="mt-2 font-medium text-success-700">
              {t("trade.cashRefunded")}
            </p>
          )}
        </Alert>
      )}
    </>
  );
}
