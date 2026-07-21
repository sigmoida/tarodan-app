"use client";

import {
  enumLabel,
  shipmentStatusConfig,
  shipmentProviderConfig,
} from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { DataList, Field } from "@/components/detail/DataList";
import type { OrderDetail } from "../types";
import { hasRealShipment } from "../_lib/status";

/** Shipping card — only when a real shipment exists (trackingNumber + shipped). */
export function ShippingSection({
  order,
  isCancelledOrder,
}: {
  order: OrderDetail;
  isCancelledOrder: boolean;
}) {
  const t = useTranslations();
  if (!hasRealShipment(order, isCancelledOrder) || !order.shipment) return null;

  const isDeliveredOrCompleted = ["delivered", "completed"].includes(
    order.status,
  );
  const statusLabel = isDeliveredOrCompleted
    ? t("admin.operations.common.delivered")
    : order.shipment.status
      ? enumLabel(shipmentStatusConfig, order.shipment.status)
      : null;

  return (
    <SectionCard title={t("admin.operations.orders.shippingTitle")}>
      <DataList columns={1}>
        <Field label={t("admin.operations.common.trackingNumber")}>
          <span className="font-mono text-sm">
            {order.shipment.providerTrackingId ?? order.shipment.trackingNumber}
          </span>
        </Field>
        {order.shipment.carrier && (
          <Field label={t("admin.operations.orders.carrier")}>
            {enumLabel(shipmentProviderConfig, order.shipment.carrier)}
          </Field>
        )}
        {statusLabel && <Field label={t("common.status")}>{statusLabel}</Field>}
      </DataList>
    </SectionCard>
  );
}
