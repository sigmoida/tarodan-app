import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, shipmentStatusConfig } from "@tarodan/ui";
import {
  col,
  CellCode,
  Empty,
  TruncatedText,
  type RowActionItem,
} from "@/components/table";
import { legLabel, formatRelative } from "../_shared";
import type {
  PhysicalShipmentRow,
  ReturnShipmentRow,
  TradeShipmentRow,
  SuratShipmentRow,
} from "./types";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Columns for the PHYSICAL shipment list: one row per parcel (sibling orders
 * that share a package are already merged upstream — see `toPhysicalShipments`).
 * The order column stacks the parcel's line-items so per-order navigation is
 * preserved even though the rows are consolidated.
 */
export const physicalShipmentColumns = (t: T) => [
  col.custom<PhysicalShipmentRow>(
    t("admin.operations.common.order"),
    (r) => (
      <div className="flex min-w-0 flex-col gap-1.5">
        {r.items.map((it) => (
          <div key={it.orderId} className="min-w-0">
            <Link
              href={`/operations/orders/${it.orderId}`}
              className="block text-primary-600 hover:underline"
            >
              <TruncatedText>
                {`#${it.orderNumber}${it.quantity > 1 ? ` ×${it.quantity}` : ""}`}
              </TruncatedText>
            </Link>
          </div>
        ))}
      </div>
    ),
    { grow: 3, minWidth: 220, sortKey: "order.orderNumber", sortType: "text" },
  ),
  col.product<PhysicalShipmentRow>(
    t("admin.catalog.common.product"),
    (r) => {
      const first = r.items[0];
      return first?.productTitle
        ? {
            title: first.productTitle,
            secondary:
              r.items.length > 1 ? `+${r.items.length - 1}` : undefined,
            href: first.productId
              ? `/catalog/products/${first.productId}`
              : undefined,
          }
        : null;
    },
    { sortKey: "order.product.title" },
  ),
  col.user<PhysicalShipmentRow>(
    t("admin.operations.common.buyer"),
    (r) =>
      r.buyer
        ? {
            name: r.buyer.displayName,
            secondary: r.buyer.email,
            href: `/accounts/users/${r.buyer.id}`,
          }
        : null,
    { sortKey: "order.buyer.displayName" },
  ),
  col.user<PhysicalShipmentRow>(
    t("admin.operations.common.seller"),
    (r) =>
      r.seller
        ? {
            name: r.seller.displayName,
            secondary: r.seller.email,
            href: `/accounts/users/${r.seller.id}`,
          }
        : null,
    { sortKey: "order.seller.displayName" },
  ),
  col.muted<PhysicalShipmentRow>(
    t("admin.operations.shipping.carrier"),
    "provider",
  ),
  col.custom<PhysicalShipmentRow>(
    t("admin.operations.common.trackingNumber"),
    (r) =>
      r.providerTrackingId ? (
        <a
          href={`https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(r.providerTrackingId)}`}
          target="_blank"
          rel="noreferrer"
          className="block truncate font-mono text-xs text-primary-600 hover:underline"
          title={r.providerTrackingId}
        >
          {r.providerTrackingId}
        </a>
      ) : (
        <CellCode value={r.trackingNumber} />
      ),
    { grow: 2, sortKey: "providerTrackingId", sortType: "text" },
  ),
  col.badge<PhysicalShipmentRow>(
    t("common.status"),
    (r) => (
      <Badge
        status={(r.status || "").toLowerCase()}
        config={shipmentStatusConfig}
      />
    ),
    { sortKey: "status", sortType: "text" },
  ),
];

export const returnShipmentColumns = (t: T) => [
  col.link<ReturnShipmentRow>(
    t("admin.operations.common.refundNumber"),
    (r) => ({
      href: `/operations/refund-requests/${r.id}`,
      label: r.refundNumber,
    }),
    { sortKey: "refundNumber", sortType: "text" },
  ),
  col.link<ReturnShipmentRow>(
    t("admin.operations.common.order"),
    (r) =>
      r.order
        ? {
            href: `/operations/orders/${r.order.id}`,
            label: r.order.orderNumber,
          }
        : null,
    { sortKey: "order.orderNumber" },
  ),
  col.text<ReturnShipmentRow>(
    t("admin.operations.shipping.carrier"),
    "returnProvider",
    { grow: 1 },
  ),
  col.code<ReturnShipmentRow>(
    t("admin.operations.common.trackingNumber"),
    (r) => r.returnProviderTrackingId ?? r.returnTrackingNumber,
  ),
  col.badge<ReturnShipmentRow>(
    t("common.status"),
    (r) =>
      r.returnStatus ? (
        <Badge status={r.returnStatus} config={shipmentStatusConfig} />
      ) : (
        <Empty />
      ),
    { sortKey: "returnStatus", sortType: "text" },
  ),
  col.date<ReturnShipmentRow>(
    t("admin.operations.shipping.shippedAt"),
    "returnShippedAt",
  ),
  col.date<ReturnShipmentRow>(
    t("admin.operations.shipping.delivered"),
    "returnDeliveredAt",
  ),
];

export const tradeShipmentColumns = (t: T) => [
  col.link<TradeShipmentRow>(
    t("admin.operations.shipping.tradeNumber"),
    (r) =>
      r.trade
        ? {
            href: `/operations/trades/${r.trade.id}`,
            label: r.trade.tradeNumber || `#${r.trade.id.slice(0, 8)}`,
          }
        : null,
    { sortKey: "trade.tradeNumber" },
  ),
  col.text<TradeShipmentRow>(
    t("admin.operations.shipping.direction"),
    (r) => legLabel(t, r.leg),
    {
      grow: 2,
      sortKey: "leg",
      sortType: "text",
    },
  ),
  col.text<TradeShipmentRow>(
    t("admin.operations.shipping.carrier"),
    "carrier",
    { grow: 1 },
  ),
  col.code<TradeShipmentRow>(
    t("admin.operations.common.trackingNumber"),
    (r) => r.providerTrackingId ?? r.trackingNumber,
  ),
  col.badge<TradeShipmentRow>(
    t("common.status"),
    (r) => <Badge status={r.status} config={shipmentStatusConfig} />,
    { sortKey: "status", sortType: "text" },
  ),
  col.user<TradeShipmentRow>(
    t("admin.operations.shipping.sender"),
    (r) =>
      r.shipper
        ? {
            name: r.shipper.displayName,
            secondary: r.shipper.email,
            href: `/accounts/users/${r.shipper.id}`,
          }
        : null,
    { sortKey: "shipper.displayName" },
  ),
  col.user<TradeShipmentRow>(
    t("admin.messaging.messages.receiver"),
    (r) =>
      r.recipientUser
        ? {
            name: r.recipientUser.displayName,
            secondary: r.recipientUser.email,
            href: `/accounts/users/${r.recipientUser.id}`,
          }
        : null,
    { sortKey: "recipientUser.displayName" },
  ),
  col.muted<TradeShipmentRow>(
    t("admin.operations.shipping.updated"),
    (r) => formatRelative(t, r.updatedAt),
    {
      grow: 1,
      minWidth: 130,
      sortKey: "updatedAt",
      sortType: "date",
    },
  ),
];

export function suratShipmentColumns(
  t: T,
  rowMenu: (r: SuratShipmentRow) => RowActionItem[],
) {
  return [
    col.link<SuratShipmentRow>(
      t("admin.operations.common.order"),
      (r) =>
        r.order
          ? {
              href: `/operations/orders/${r.order.id}`,
              label: `#${r.order.orderNumber}`,
            }
          : null,
      { sortKey: "order.orderNumber" },
    ),
    col.user<SuratShipmentRow>(
      t("admin.operations.common.buyer"),
      (r) =>
        r.order?.buyer
          ? {
              name: r.order.buyer.displayName,
              secondary: r.order.buyer.email,
              href: `/accounts/users/${r.order.buyer.id}`,
            }
          : null,
      { sortKey: "order.buyer.displayName" },
    ),
    col.user<SuratShipmentRow>(
      t("admin.operations.common.seller"),
      (r) =>
        r.order?.seller
          ? {
              name: r.order.seller.displayName,
              secondary: r.order.seller.email,
              href: `/accounts/users/${r.order.seller.id}`,
            }
          : null,
      { sortKey: "order.seller.displayName" },
    ),
    col.custom<SuratShipmentRow>(
      t("admin.operations.common.trackingNumber"),
      (r) =>
        r.trackingNumber && r.trackingUrl ? (
          <a
            href={r.trackingUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate font-mono text-xs text-primary-600 hover:underline"
            title={r.trackingNumber}
          >
            {r.trackingNumber}
          </a>
        ) : (
          <CellCode value={r.trackingNumber} />
        ),
      { grow: 2, sortKey: "trackingNumber", sortType: "text" },
    ),
    col.custom<SuratShipmentRow>(
      t("admin.operations.shipping.suratStatus"),
      (r) => (
        <div className="flex flex-col gap-0.5">
          <Badge
            status={(r.status || "").toLowerCase()}
            config={shipmentStatusConfig}
          />
          {r.providerRawStatus ? (
            <span className="truncate text-xs text-muted">
              {r.providerRawStatus}
              {r.providerStatusCode != null ? ` (${r.providerStatusCode})` : ""}
            </span>
          ) : null}
        </div>
      ),
      {
        grow: 2,
        minWidth: 150,
        sortKey: "status",
        sortType: "text",
      },
    ),
    col.muted<SuratShipmentRow>(
      t("admin.operations.shipping.lastUpdated"),
      (r) => (r.updatedAt ? formatRelative(t, r.updatedAt) : undefined),
      {
        grow: 1,
        minWidth: 130,
        sortKey: "updatedAt",
        sortType: "date",
      },
    ),
    col.rowMenu<SuratShipmentRow>(rowMenu),
  ];
}
