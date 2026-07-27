/** @format */

"use client";

import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Alert } from "@tarodan/ui";
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
    <Alert
      variant="default"
      icon={<InformationCircleIcon className="h-5 w-5 text-muted" />}
      title={t("order.statusDelivered")}
    >
      <p className="text-muted">
        {payoutDateStr
          ? t("order.payoutReleaseWithDate", { date: payoutDateStr })
          : t("order.payoutRelease")}
      </p>
      {order.activeRefundRequest && (
        <p className="mt-2 font-medium text-muted">
          {t("order.paymentOnHoldRefund")}
        </p>
      )}
    </Alert>
  );
}
