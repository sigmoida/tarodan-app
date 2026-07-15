/** @format */

"use client";

import { useTranslations } from "next-intl";
import {
  computePayoutDate,
  isMembershipOrder,
  type OrderDetail,
} from "../_lib/types";

/**
 * Escrow bilgisi (teslim sonrası) — alıcı onayı artık payout tetiklemez.
 * Satıcıya ödeme: teslim + 14 gün iade penceresi + 1 gün grace ile otomatik.
 */
export default function EscrowInfoCard({ order }: { order: OrderDetail }) {
  const t = useTranslations();

  if (
    !order.isBuyer ||
    !["delivered", "awaiting_buyer_confirmation"].includes(order.status) ||
    isMembershipOrder(order)
  ) {
    return null;
  }

  const payoutDate = computePayoutDate(order);
  const payoutDateStr = payoutDate?.toLocaleDateString(t("common.dateLocale"), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bg-info-50 border border-info-200 rounded-xl shadow-sm p-6">
      <h2 className="mb-2 text-lg font-semibold text-info-800">
        {t("order.statusDelivered")}
      </h2>
      <p className="text-sm text-info-800">
        {payoutDateStr
          ? t("order.payoutReleaseWithDate", { date: payoutDateStr })
          : t("order.payoutRelease")}
      </p>
      {order.activeRefundRequest && (
        <p className="text-sm text-info-800 mt-2 font-medium">
          {t("order.paymentOnHoldRefund")}
        </p>
      )}
    </div>
  );
}
