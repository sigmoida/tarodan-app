"use client";

/** @format */

import { SHIPMENT_STATUS_CHIP, type ShipmentChipMeta } from "../_lib/types";
import { useTranslations } from "next-intl";

export default function ShipmentStatusChip({
  status,
}: {
  status?: string | null;
}) {
  const t = useTranslations();
  const meta: ShipmentChipMeta = (status &&
    SHIPMENT_STATUS_CHIP(t)[status]) || {
    label: t("trade.shipmentStatus.fallback"),
    className: "bg-surface-muted text-muted border border-border-subtle",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}
    >
      {meta.Icon ? <meta.Icon className="size-3.5" aria-hidden /> : null}
      {meta.label}
    </span>
  );
}
