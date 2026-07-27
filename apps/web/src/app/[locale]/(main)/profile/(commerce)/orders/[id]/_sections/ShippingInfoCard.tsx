/** @format */

"use client";

import { TruckIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Alert, Button } from "@tarodan/ui";
import { SectionCard, CopyButton } from "@/components/ui";
import { useTranslations } from "next-intl";
import type { OrderDetail } from "../_lib/types";

const SHIPPED_ORDER_STATUSES = [
  "shipped",
  "delivered",
  "awaiting_buyer_confirmation",
  "completed",
];

/**
 * Kargo bilgileri — SADECE gerçek gönderi varken: shipment + dolu trackingNumber +
 * sipariş durumu kargolanmış/teslim. İptal ya da teslim öncesi durumlarda gizli.
 */
export default function ShippingInfoCard({ order }: { order: OrderDetail }) {
  const t = useTranslations();

  const statusLabelMap: Record<string, string> = {
    pending: t("order.shipStatusPending"),
    label_created: t("order.shipStatusLabelCreated"),
    picked_up: t("order.shipStatusPickedUp"),
    in_transit: t("order.shipStatusInTransit"),
    at_delivery_branch: t("order.shipStatusAtDeliveryBranch"),
    out_for_delivery: t("order.shipStatusOutForDelivery"),
    delivered: t("order.statusDelivered"),
    failed: t("order.shipStatusFailed"),
    return_in_progress: t("order.shipStatusReturnInProgress"),
    returned: t("order.shipStatusReturned"),
    cancelled: t("order.statusCancelled"),
  };

  const isIptalOrder = order.cancellationType === "iptal";
  if (
    !order.shipment ||
    !order.shipment.trackingNumber ||
    isIptalOrder ||
    order.status === "cancelled" ||
    !SHIPPED_ORDER_STATUSES.includes(order.status)
  ) {
    return null;
  }

  // Sipariş durumu (order.status) admin tarafından elle ileri alındığında shipment.status
  // geride kalabiliyor. Bu durumda sipariş durumunu gerçeğin kaynağı kabul edip etkin
  // (effective) bir kargo durumu türetiyoruz.
  const orderShipped = SHIPPED_ORDER_STATUSES.includes(order.status);
  const orderDelivered = [
    "delivered",
    "awaiting_buyer_confirmation",
    "completed",
  ].includes(order.status);

  let s = order.shipment.status;
  const isReturnFlow = s === "return_in_progress" || s === "returned";
  const orderCancelled =
    order.status === "cancelled" || order.status === "refunded";
  if (orderCancelled && !isReturnFlow) {
    s = "cancelled";
  } else if (orderDelivered && s !== "delivered" && !isReturnFlow) {
    s = "delivered";
  } else if (orderShipped && (s === "pending" || s === "label_created")) {
    s = "in_transit";
  }

  const isPending = s === "pending";
  const isCancelled = s === "cancelled" || s === "failed";
  const isShippedActive =
    s === "label_created" ||
    s === "picked_up" ||
    s === "in_transit" ||
    s === "at_delivery_branch" ||
    s === "out_for_delivery";
  const isDelivered = s === "delivered";

  // Satıcı için pending durumunda kartı tamamen gizle —
  // 'Kargo Referans Numarası' aksiyon kartı zaten görünüyor.
  if (isPending && order.isSeller && !order.isBuyer) {
    return null;
  }

  const statusLbl = statusLabelMap[s] ?? s;

  return (
    <SectionCard title={t("order.shippingInfo")}>
      {isPending && order.isBuyer && (
        <div className="bg-surface-alt border border-border rounded-lg p-4 text-sm text-muted">
          {t("order.shipmentPreparingBuyer")}
        </div>
      )}

      {isCancelled && (
        <Alert
          variant="danger"
          icon={<XCircleIcon className="h-5 w-5 text-danger-600" />}
        >
          {t("order.shipmentCancelled")}
        </Alert>
      )}

      {(isShippedActive || isDelivered) && (
        <div className="space-y-3">
          {order.shipment.trackingNumber && (
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted">{t("order.trackingNumber")}:</span>
              <span className="flex items-center gap-1">
                <span className="font-mono bg-surface-alt px-2 py-1 rounded text-sm">
                  {order.shipment.trackingNumber}
                </span>
                <CopyButton value={order.shipment.trackingNumber} />
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted">{t("common.status")}:</span>
            <span
              className={`font-medium ${isDelivered ? "text-success-700" : "text-body"}`}
            >
              {statusLbl}
            </span>
          </div>
          {order.isBuyer &&
            order.shipment.trackingNumber &&
            order.shipment.provider === "surat" && (
              <div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-border-default">
                <Button asChild variant="primary" size="sm" className="gap-2">
                  <a
                    href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(order.shipment.trackingNumber)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <TruckIcon className="w-4 h-4" />
                    {t("order.track")}
                  </a>
                </Button>
              </div>
            )}
        </div>
      )}
    </SectionCard>
  );
}
