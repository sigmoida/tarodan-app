import Link from "next/link";
import {
  Badge,
  IconButton,
  orderStatusConfig,
  shipmentStatusConfig,
} from "@tarodan/ui";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { cancelReasonLabel, orderOriginLabel } from "@/lib/utils";
import { fmtTry } from "@/lib/format";
import { col, TruncatedText } from "@/components/table";
import { type OrderGroupRow } from "./orders";

type T = ReturnType<typeof useTranslations<never>>;

export interface OrderColumnProps {
  t: T;
  expandedId: string | null;
  toggleRow: (id: string) => void;
}

export function orderColumns({ t, expandedId, toggleRow }: OrderColumnProps) {
  return [
    col.custom<OrderGroupRow>(
      "",
      (o) => {
        const open = expandedId === o.id;
        return (
          <IconButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              toggleRow(o.id);
            }}
            aria-expanded={open}
            title={
              open
                ? t("admin.operations.orders.hideItems")
                : t("admin.operations.orders.showItems")
            }
            aria-label={
              open
                ? t("admin.operations.orders.hideItems")
                : t("admin.operations.orders.showItems")
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
    col.custom<OrderGroupRow>(
      t("admin.operations.orders.groupNumber"),
      (o) => (
        <Link
          href={`/operations/orders/${o.orderId}`}
          className="block text-primary-600 hover:underline"
        >
          <TruncatedText className="font-mono">{o.displayNumber}</TruncatedText>
        </Link>
      ),
      {
        minWidth: 200,
        sortKey: "orderNumber",
        sortType: "text",
        exportValue: (o) => o.displayNumber,
      },
    ),
    col.custom<OrderGroupRow>(
      t("common.status"),
      (o) =>
        o.itemCount > 1 ? (
          <Badge variant={o.groupStatus === "done" ? "success" : "default"}>
            {o.groupStatus === "done"
              ? t("admin.operations.orders.groupDone")
              : t("admin.operations.orders.groupOngoing")}
          </Badge>
        ) : (
          <div className="flex min-w-0 max-w-full flex-col items-start gap-1">
            {o.activeRefundRequest ? (
              <Badge
                status="refund_requested"
                config={orderStatusConfig}
                label={t("admin.operations.orders.status.refundInProgress")}
              />
            ) : o.cancellationType === "iptal" ? (
              <Badge
                status="cancelled"
                config={orderStatusConfig}
                label={t("admin.operations.orders.status.cancelledConfirmed")}
              />
            ) : (
              <Badge status={o.status} config={orderStatusConfig} />
            )}
            {(o.status === "cancelled" || o.cancellationType === "iptal") &&
              cancelReasonLabel(o.cancelReason, t) && (
                <TruncatedText className="max-w-full text-xs text-muted">
                  {`${cancelReasonLabel(o.cancelReason, t)} · ${t(
                    "admin.operations.orders.originCancellation",
                    { origin: orderOriginLabel(o.offerId, t) },
                  )}`}
                </TruncatedText>
              )}
          </div>
        ),
      { minWidth: 220, sortKey: "status", sortType: "text" },
    ),
    col.user<OrderGroupRow>(
      t("admin.operations.orders.buyer"),
      (o) => ({
        name: o.buyer.displayName,
        secondary: o.buyer.email,
        href: `/accounts/users/${o.buyer.id}`,
      }),
      {
        minWidth: 340,
        sortKey: "buyer.displayName",
        sortType: "text",
      },
    ),
    col.product<OrderGroupRow>(
      t("admin.catalog.common.product"),
      (o) => {
        const product = o.items[0]?.product;
        return product
          ? {
              title: product.title,
              image: o.items[0]?.productImageUrl,
              href: `/catalog/products/${product.id}`,
            }
          : null;
      },
      {
        minWidth: 300,
        sortKey: "product.title",
        sortType: "text",
      },
    ),
    col.number<OrderGroupRow>(
      t("admin.operations.orders.productCount"),
      (o) => o.itemCount,
      {
        minWidth: 128,
        sortable: false,
      },
    ),
    col.money<OrderGroupRow>(t("common.amount"), (o) => o.totalAmount, {
      tone: "primary",
      minWidth: 110,
      sortKey: "totalAmount",
      sortType: "number",
    }),
    col.custom<OrderGroupRow>(
      t("admin.operations.orders.commission"),
      (o) => {
        const rate =
          o.subtotal > 0 ? Math.round((o.commission / o.subtotal) * 100) : null;
        return (
          <span className="whitespace-nowrap tabular-nums">
            <span className="font-medium text-success-600">
              {fmtTry(o.commission)}
            </span>
            {rate != null && (
              <span className="ml-1 text-xs text-muted">%{rate}</span>
            )}
          </span>
        );
      },
      {
        minWidth: 140,
        sortKey: "commissionAmount",
        sortType: "number",
      },
    ),
    col.badge<OrderGroupRow>(
      t("admin.operations.orders.cargoStatus"),
      (o) =>
        o.itemCount > 1 || !o.shipmentStatus ? (
          <span className="text-subtle">—</span>
        ) : (
          <Badge status={o.shipmentStatus} config={shipmentStatusConfig} />
        ),
      { minWidth: 140 },
    ),
    col.date<OrderGroupRow>(t("common.date"), "createdAt", { minWidth: 120 }),
  ];
}
