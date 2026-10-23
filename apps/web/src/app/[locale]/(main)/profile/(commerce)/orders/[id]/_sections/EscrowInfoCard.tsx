/** @format */

"use client";

import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Alert } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { isDigitalOrder } from "@tarodan/types";
import { useTimingPolicy, useTimingValues } from "@/hooks/useTimingPolicy";
import { computePayoutDate, type OrderDetail } from "../_lib/types";

/**
 * Escrow note after delivery; the buyer's confirmation no longer triggers the
 * payout. The seller is paid automatically on the date the server wrote to
 * the hold (delivery + return window + payout grace); the date and day counts
 * come from the timing rules. A digital order (membership, boost) has no
 * escrow.
 */
export default function EscrowInfoCard({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const policy = useTimingPolicy();
  const timingValues = useTimingValues();

  if (
    !order.isBuyer ||
    !["delivered", "awaiting_buyer_confirmation"].includes(order.status) ||
    isDigitalOrder(order)
  ) {
    return null;
  }

  const payoutDate = computePayoutDate(order, policy);
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
          ? t("order.payoutReleaseWithDate", {
              ...timingValues,
              date: payoutDateStr,
            })
          : t("order.payoutRelease", timingValues)}
      </p>
      {order.activeRefundRequest && (
        <p className="mt-2 font-medium text-muted">
          {t("order.paymentOnHoldRefund")}
        </p>
      )}
    </Alert>
  );
}
