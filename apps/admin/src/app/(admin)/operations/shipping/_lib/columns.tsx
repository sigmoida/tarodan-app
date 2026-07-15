import { useTranslations } from "next-intl";
import { Badge, shipmentStatusConfig } from "@tarodan/ui";
import { col, CellCode, Empty, type RowActionItem } from "@/components/table";
import { legLabel, formatRelative } from "../_shared";
import type {
  OrderShipmentRow,
  ReturnShipmentRow,
  TradeShipmentRow,
  SuratShipmentRow,
} from "./types";

type T = ReturnType<typeof useTranslations<never>>;

export const orderShipmentColumns = (t: T) => [
  col.link<OrderShipmentRow>(t("admin.operations.common.order"), (r) =>
    r.order
      ? {
          href: `/operations/orders/${r.order.id}`,
          label: `#${r.order.orderNumber}`,
        }
      : null,
  ),
  col.text<OrderShipmentRow>(
    t("admin.operations.common.buyer"),
    (r) => r.order?.buyer?.displayName,
  ),
  col.muted<OrderShipmentRow>(
    t("admin.operations.shipping.carrier"),
    (r) => r.provider,
  ),
  col.custom<OrderShipmentRow>(
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
    { grow: 2 },
  ),
  col.badge<OrderShipmentRow>(t("common.status"), (r) => (
    <Badge
      status={(r.status || "").toLowerCase()}
      config={shipmentStatusConfig}
    />
  )),
];

export const returnShipmentColumns = (t: T) => [
  col.link<ReturnShipmentRow>(
    t("admin.operations.common.refundNumber"),
    (r) => ({
      href: `/operations/refund-requests/${r.id}`,
      label: r.refundNumber,
    }),
  ),
  col.link<ReturnShipmentRow>(t("admin.operations.common.order"), (r) =>
    r.order
      ? { href: `/operations/orders/${r.order.id}`, label: r.order.orderNumber }
      : null,
  ),
  col.text<ReturnShipmentRow>(
    t("admin.operations.shipping.carrier"),
    (r) => r.returnProvider,
    { grow: 1 },
  ),
  col.code<ReturnShipmentRow>(
    t("admin.operations.common.trackingNumber"),
    (r) => r.returnTrackingNumber,
  ),
  col.badge<ReturnShipmentRow>(t("common.status"), (r) =>
    r.returnStatus ? (
      <Badge status={r.returnStatus} config={shipmentStatusConfig} />
    ) : (
      <Empty />
    ),
  ),
  col.date<ReturnShipmentRow>(
    t("admin.operations.shipping.shippedAt"),
    (r) => r.returnShippedAt,
  ),
  col.date<ReturnShipmentRow>(
    t("admin.operations.shipping.delivered"),
    (r) => r.returnDeliveredAt,
  ),
];

export const tradeShipmentColumns = (t: T) => [
  col.link<TradeShipmentRow>(t("admin.operations.shipping.tradeNumber"), (r) =>
    r.trade
      ? {
          href: `/operations/trades/${r.trade.id}`,
          label: r.trade.tradeNumber || `#${r.trade.id.slice(0, 8)}`,
        }
      : null,
  ),
  col.text<TradeShipmentRow>(
    t("admin.operations.shipping.direction"),
    (r) => legLabel(t, r.leg),
    {
      grow: 2,
    },
  ),
  col.text<TradeShipmentRow>(
    t("admin.operations.shipping.carrier"),
    (r) => r.carrier,
    { grow: 1 },
  ),
  col.code<TradeShipmentRow>(
    t("admin.operations.common.trackingNumber"),
    (r) => r.trackingNumber,
  ),
  col.badge<TradeShipmentRow>(t("common.status"), (r) => (
    <Badge status={r.status} config={shipmentStatusConfig} />
  )),
  col.user<TradeShipmentRow>(t("admin.operations.shipping.sender"), (r) =>
    r.shipper
      ? { name: r.shipper.displayName, href: `/accounts/users/${r.shipper.id}` }
      : null,
  ),
  col.muted<TradeShipmentRow>(
    t("admin.operations.shipping.updated"),
    (r) => formatRelative(t, r.updatedAt),
    {
      grow: 1,
      minWidth: 130,
    },
  ),
];

export function suratShipmentColumns(
  t: T,
  rowMenu: (r: SuratShipmentRow) => RowActionItem[],
) {
  return [
    col.link<SuratShipmentRow>(t("admin.operations.common.order"), (r) =>
      r.order
        ? {
            href: `/operations/orders/${r.order.id}`,
            label: `#${r.order.orderNumber}`,
          }
        : null,
    ),
    col.text<SuratShipmentRow>(
      t("admin.operations.common.buyer"),
      (r) => r.order?.buyer?.displayName,
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
      { grow: 2 },
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
      { grow: 2, minWidth: 150 },
    ),
    col.muted<SuratShipmentRow>(
      t("admin.operations.shipping.lastUpdated"),
      (r) => (r.updatedAt ? formatRelative(t, r.updatedAt) : undefined),
      { grow: 1, minWidth: 130 },
    ),
    col.rowMenu<SuratShipmentRow>(rowMenu),
  ];
}
