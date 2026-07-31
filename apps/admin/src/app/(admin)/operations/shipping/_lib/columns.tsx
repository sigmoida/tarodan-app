import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, IconButton, shipmentStatusConfig } from "@tarodan/ui";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
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

interface PhysicalShipmentColumnProps {
  t: T;
  expandedId: string | null;
  toggleRow: (id: string) => void;
}

function parcelLabel(row: PhysicalShipmentRow): string {
  const packageId = row.id.startsWith("pkg:") ? row.id.slice(4) : null;
  if (packageId) return `PKG-${packageId.slice(-10).toUpperCase()}`;
  return row.providerTrackingId ?? row.trackingNumber ?? row.id.slice(5);
}

function carrierLabel(provider: string | null, t: T): string | null {
  if (!provider) return null;
  return provider.toLowerCase() === "surat"
    ? t("admin.operations.shipping.orders.carrierSurat")
    : provider;
}

/**
 * Columns for the PHYSICAL shipment list: one row per parcel (sibling orders
 * that share a package are already merged upstream — see `toPhysicalShipments`).
 * The expandable detail preserves per-order navigation even though the rows are
 * consolidated.
 */
export const physicalShipmentColumns = ({
  t,
  expandedId,
  toggleRow,
}: PhysicalShipmentColumnProps) => [
  col.custom<PhysicalShipmentRow>(
    "",
    (row) => {
      const open = expandedId === row.id;
      return (
        <IconButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            toggleRow(row.id);
          }}
          aria-expanded={open}
          title={
            open
              ? t("admin.operations.shipping.orders.hideContents")
              : t("admin.operations.shipping.orders.showContents")
          }
          aria-label={
            open
              ? t("admin.operations.shipping.orders.hideContents")
              : t("admin.operations.shipping.orders.showContents")
          }
          className="text-muted hover:text-primary-600"
        >
          <ChevronRightIcon
            className={`h-4 w-4 transition-transform ${
              open ? "rotate-90 text-primary-600" : ""
            }`}
          />
        </IconButton>
      );
    },
    {
      id: "expand",
      minWidth: 52,
      fixed: true,
      align: "center",
      sortable: false,
    },
  ),
  col.custom<PhysicalShipmentRow>(
    t("admin.operations.shipping.orders.shipment"),
    (row) => (
      <div className="min-w-0">
        <TruncatedText className="font-mono font-medium text-heading">
          {parcelLabel(row)}
        </TruncatedText>
        <TruncatedText className="text-xs text-muted">
          {t("admin.operations.shipping.orders.packageSummary", {
            orders: row.items.length,
            products: row.items.reduce(
              (sum, item) => sum + (item.quantity ?? 1),
              0,
            ),
          })}
        </TruncatedText>
      </div>
    ),
    {
      minWidth: 230,
      sortKey: "order.orderNumber",
      sortType: "text",
      exportValue: (row) => parcelLabel(row),
    },
  ),
  col.product<PhysicalShipmentRow>(
    t("admin.operations.shipping.orders.products"),
    (row) => {
      const first = row.items[0];
      const quantity = row.items.reduce((sum, item) => sum + item.quantity, 0);
      return first?.productTitle
        ? {
            title: first.productTitle,
            secondary: t("admin.operations.shipping.orders.productSummary", {
              products: row.items.length,
              quantity,
            }),
            image: first.productImageUrl,
            href: first.productId
              ? `/catalog/products/${first.productId}`
              : undefined,
          }
        : null;
    },
    { minWidth: 340, sortKey: "order.product.title" },
  ),
  col.user<PhysicalShipmentRow>(
    t("admin.operations.shipping.sender"),
    (r) =>
      r.seller
        ? {
            name: r.seller.displayName,
            secondary: r.seller.email,
            href: `/accounts/users/${r.seller.id}`,
          }
        : null,
    { minWidth: 280, sortKey: "order.seller.displayName" },
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
    { minWidth: 280, sortKey: "order.buyer.displayName" },
  ),
  col.custom<PhysicalShipmentRow>(
    t("admin.operations.shipping.orders.carrierAndTracking"),
    (row) => {
      const tracking = row.providerTrackingId ?? row.trackingNumber;
      const trackingUrl =
        row.trackingUrl ??
        (row.providerTrackingId
          ? `https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=${encodeURIComponent(row.providerTrackingId)}`
          : null);
      return (
        <div className="min-w-0">
          <TruncatedText className="font-medium text-heading">
            {carrierLabel(row.provider, t) ??
              t("admin.operations.shipping.orders.carrierPending")}
          </TruncatedText>
          {tracking && trackingUrl ? (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate font-mono text-xs text-primary-600 hover:underline"
              title={tracking}
            >
              {tracking}
            </a>
          ) : tracking ? (
            <CellCode value={tracking} />
          ) : (
            <TruncatedText className="text-xs text-muted">
              {t("admin.operations.shipping.orders.trackingPending")}
            </TruncatedText>
          )}
        </div>
      );
    },
    {
      minWidth: 240,
      sortKey: "providerTrackingId",
      sortType: "text",
    },
  ),
  col.badge<PhysicalShipmentRow>(
    t("common.status"),
    (r) => (
      <Badge
        status={(r.status || "").toLowerCase()}
        config={shipmentStatusConfig}
      />
    ),
    { minWidth: 180, sortKey: "status", sortType: "text" },
  ),
  col.muted<PhysicalShipmentRow>(
    t("admin.operations.shipping.lastUpdated"),
    (row) => formatRelative(t, row.updatedAt),
    {
      minWidth: 150,
      sortKey: "updatedAt",
      sortType: "date",
    },
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
    // Paket satırı: aynı barkodun kardeş sipariş numaraları etikete eklenir
    // (R6 — bir koli tek satır; siparişler ayrı koli değildir).
    col.link<SuratShipmentRow>(
      t("admin.operations.common.order"),
      (r) =>
        r.order
          ? {
              href: `/operations/orders/${r.order.id}`,
              label: r.siblingOrderNumbers?.length
                ? `#${r.order.orderNumber} +${r.siblingOrderNumbers.length}`
                : `#${r.order.orderNumber}`,
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
