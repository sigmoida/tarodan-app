"use client";

import Link from "next/link";
import { Button, cn, enumLabel, shipmentStatusConfig } from "@tarodan/ui";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import {
  ShipmentProducts,
  type ShipmentProductInfo,
} from "@/components/detail/ShipmentProducts";
import type { TradeShipment } from "../types";
import { isShipmentDelivered } from "../_lib/trade";
import { statusConfig } from "@/lib/statusLabels";

export interface ShipmentLegCardProps {
  title: string;
  shipments: TradeShipment[];
  actionLabel: string | null;
  onAction: ((shipmentId: string) => void) | null;
  /** Shipment id currently being processed by `onAction`. */
  processingShipmentId: string | null;
  infoMessage?: string;
  secondaryActionLabel?: string;
  onSecondaryAction?: (shipmentId: string) => void;
  /** shipmentId → product(s) that cargo carries, so admins see which product it's for. */
  productsByShipmentId?: Record<string, ShipmentProductInfo[]>;
}

/** One shipment leg (to-warehouse / from-warehouse / return) with per-shipment actions. */
export function ShipmentLegCard({
  title,
  shipments,
  actionLabel,
  onAction,
  processingShipmentId,
  infoMessage,
  secondaryActionLabel,
  onSecondaryAction,
  productsByShipmentId,
}: ShipmentLegCardProps) {
  const t = useTranslations();
  return (
    <SectionCard
      title={
        <>
          {title}
          <span className="text-sm font-normal text-muted">
            ({shipments.length})
          </span>
        </>
      }
    >
      {infoMessage && (
        <p className="mb-4 rounded border border-info-200 bg-info-50 p-3 text-sm text-info-700">
          {infoMessage}
        </p>
      )}
      <div className="space-y-3">
        {shipments.map((s) => {
          const delivered = isShipmentDelivered(s);
          const isProcessing = processingShipmentId === s.id;
          return (
            <div
              key={s.id}
              className={cn(
                "rounded-lg border p-4",
                delivered
                  ? "border-success-200 bg-success-50"
                  : "border-border bg-surface",
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1 text-sm">
                  {s.sender && (
                    <p>
                      <span className="font-medium text-body">
                        {t("admin.operations.trades.sender")}:
                      </span>{" "}
                      <Link
                        href={`/accounts/users/${s.sender.id}`}
                        className="text-primary-600 hover:underline"
                      >
                        {s.sender.displayName}
                      </Link>
                    </p>
                  )}
                  {s.recipient && (
                    <p>
                      <span className="font-medium text-body">
                        {t("admin.operations.common.recipient")}:
                      </span>{" "}
                      <Link
                        href={`/accounts/users/${s.recipient.id}`}
                        className="text-primary-600 hover:underline"
                      >
                        {s.recipient.displayName}
                      </Link>
                      {s.recipientType && (
                        <span className="ml-1 text-xs text-muted">
                          ({s.recipientType})
                        </span>
                      )}
                    </p>
                  )}
                  {(s.providerTrackingId ?? s.trackingNumber) && (
                    <p>
                      <span className="font-medium text-body">
                        {t("admin.operations.common.trackingNumber")}:
                      </span>{" "}
                      <span className="font-mono">
                        {s.providerTrackingId ?? s.trackingNumber}
                      </span>
                    </p>
                  )}
                  {s.carrier && (
                    <p>
                      <span className="font-medium text-body">
                        {t("admin.operations.trades.company")}:
                      </span>{" "}
                      {s.carrier}
                    </p>
                  )}
                  {s.status && (
                    <p>
                      <span className="font-medium text-body">
                        {t("common.status")}:
                      </span>{" "}
                      {enumLabel(
                        statusConfig(shipmentStatusConfig, t),
                        s.status,
                      )}
                    </p>
                  )}
                  {s.shippedAt && (
                    <p className="text-xs text-muted">
                      {t("admin.operations.trades.shippedAt", {
                        date: new Date(s.shippedAt).toLocaleString("tr-TR"),
                      })}
                    </p>
                  )}
                  {s.deliveredAt && (
                    <p className="text-xs text-success-700">
                      {t("admin.operations.trades.deliveredAt", {
                        date: new Date(s.deliveredAt).toLocaleString("tr-TR"),
                      })}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {s.lostAt ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-danger-700">
                      <XCircleIcon className="h-5 w-5" />
                      {t("admin.operations.trades.lost")}
                    </span>
                  ) : delivered ? (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-success-700">
                      <CheckCircleIcon className="h-5 w-5" />
                      {t("admin.operations.common.delivered")}
                    </span>
                  ) : actionLabel && onAction ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onAction(s.id)}
                      isLoading={isProcessing}
                    >
                      {actionLabel}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">
                      {t("common.pending")}
                    </span>
                  )}
                  {!s.lostAt &&
                    !delivered &&
                    secondaryActionLabel &&
                    onSecondaryAction && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSecondaryAction(s.id)}
                      >
                        {secondaryActionLabel}
                      </Button>
                    )}
                </div>
              </div>
              <ShipmentProducts
                products={productsByShipmentId?.[s.id] ?? []}
                label={t("admin.operations.trades.shipmentProducts")}
              />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
