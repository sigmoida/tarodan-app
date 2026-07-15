"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cancelReasonLabel, orderOriginLabel } from "@/lib/utils";
import type { OrderDetail } from "../types";
import type { OrderStatusView } from "../_lib/status";

/** The active-refund / cancellation notice banners above the detail grid. */
export function OrderBanners({
  order,
  status,
}: {
  order: OrderDetail;
  status: OrderStatusView;
}) {
  const t = useTranslations();
  return (
    <>
      {status.hasActiveRefund && !status.isCancelledOrder && (
        <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3">
          <p className="text-sm font-medium text-danger-700">
            {t("admin.operations.orders.banners.refundOpen")}
            {order.activeRefundRequest?.refundNumber
              ? ` (${order.activeRefundRequest.refundNumber})`
              : ""}
          </p>
          <p className="mt-0.5 text-xs text-danger-600">
            {t("admin.operations.orders.banners.payoutHeldNote1")}{" "}
            <Link
              href="/operations/refunds"
              className="underline hover:text-danger-700"
            >
              {t("admin.operations.orders.banners.refundRequestsLink")}
            </Link>{" "}
            {t("admin.operations.orders.banners.payoutHeldNote2")}
          </p>
        </div>
      )}

      {status.isCancelledOrder &&
        (cancelReasonLabel(order.cancelReason) || order.offerId) && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 px-4 py-3">
            <p className="text-sm font-medium text-danger-700">
              {t("admin.operations.orders.banners.cancelReason", {
                reason:
                  cancelReasonLabel(order.cancelReason) ??
                  t("admin.operations.common.notSpecified"),
              })}
            </p>
            <p className="mt-0.5 text-xs text-danger-600">
              {t("admin.operations.orders.banners.origin", {
                origin: orderOriginLabel(order.offerId),
              })}
              {order.cancelReason ? ` · "${order.cancelReason}"` : ""}
            </p>
          </div>
        )}
    </>
  );
}
