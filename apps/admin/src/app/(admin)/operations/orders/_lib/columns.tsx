import {
  Button,
  Badge,
  orderStatusConfig,
  shipmentStatusConfig,
} from "@tarodan/ui";
import { ShoppingBagIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { cancelReasonLabel, orderOriginLabel } from "@/lib/utils";
import { fmtTry } from "@/lib/format";
import {
  col,
  CellText,
  CellUser,
  TruncatedText,
  type RowActionItem,
} from "@/components/table";
import { type OrderGroupRow } from "./orders";

type T = ReturnType<typeof useTranslations<never>>;

export interface OrderColumnProps {
  t: T;
  expandedId: string | null;
  toggleRow: (id: string) => void;
  rowMenu: (o: OrderGroupRow) => RowActionItem[];
}

export function orderColumns({
  t,
  expandedId,
  toggleRow,
  rowMenu,
}: OrderColumnProps) {
  return [
    col.custom<OrderGroupRow>(
      t("admin.operations.orders.orderNumber"),
      (o) => {
        const open = expandedId === o.id;
        return (
          <Button
            type="button"
            variant="ghost"
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
            className="-mx-1 flex h-auto w-fit max-w-full items-center gap-1.5 rounded px-1 py-0.5 hover:bg-primary-100"
          >
            <ChevronRightIcon
              className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${
                open ? "rotate-90" : ""
              }`}
            />
            <TruncatedText className="font-mono text-sm text-primary-600">
              {o.displayNumber}
            </TruncatedText>
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-surface-alt px-1.5 py-0.5 text-[11px] font-medium text-muted">
              <ShoppingBagIcon className="h-3 w-3" />
              {t("admin.operations.orders.cartItems", { count: o.itemCount })}
            </span>
          </Button>
        );
      },
      {
        grow: 2,
        minWidth: 150,
        sortKey: "orderNumber",
        sortType: "text",
      },
    ),
    col.custom<OrderGroupRow>(
      t("common.status"),
      (o) =>
        o.isGroup ? (
          <Badge
            variant={o.groupStatus === "done" ? "success" : "default"}
            size="sm"
          >
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
      { grow: 2, minWidth: 170, sortKey: "status", sortType: "text" },
    ),
    col.user<OrderGroupRow>(
      t("admin.operations.orders.buyer"),
      (o) => ({
        name: o.buyer.displayName,
        href: `/accounts/users/${o.buyer.id}`,
      }),
      { sortKey: "buyer.displayName", sortType: "text" },
    ),
    col.custom<OrderGroupRow>(
      t("admin.operations.orders.seller"),
      (o) => {
        if (o.isMultiSeller) {
          const first = o.sellers[0];
          const extra = Math.max(0, o.sellers.length - 1);
          return (
            <span className="flex items-center gap-1 text-sm text-body">
              <CellText value={first?.displayName} />
              {extra > 0 && (
                <span className="rounded bg-surface-alt px-1 text-xs text-muted">
                  +{extra}
                </span>
              )}
            </span>
          );
        }
        const seller = o.sellers[0];
        return (
          <CellUser
            name={seller?.displayName}
            href={seller ? `/accounts/users/${seller.id}` : undefined}
          />
        );
      },
      { sortKey: "seller.displayName", sortType: "text" },
    ),
    col.id<OrderGroupRow>(t("admin.operations.orders.sellerId"), (o) =>
      o.isMultiSeller ? undefined : o.sellers[0]?.id,
    ),
    col.custom<OrderGroupRow>(
      t("admin.catalog.common.product"),
      (o) => {
        const thumbs = o.thumbs;
        const extra = o.itemCount - thumbs.length;
        return (
          <div className="flex items-center gap-1">
            {thumbs.length > 0 ? (
              thumbs.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={src}
                  alt=""
                  className="h-8 w-8 rounded border border-border-subtle bg-surface-alt object-cover"
                />
              ))
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded border border-border-subtle bg-surface-alt text-muted">
                <ShoppingBagIcon className="h-4 w-4" />
              </span>
            )}
            {extra > 0 && (
              <span className="flex h-8 min-w-8 items-center justify-center rounded border border-border-subtle bg-surface-alt px-1 text-[11px] font-medium text-muted">
                +{extra}
              </span>
            )}
          </div>
        );
      },
      { grow: 2, sortKey: "product.title", sortType: "text" },
    ),
    col.money<OrderGroupRow>(t("common.amount"), (o) => o.totalAmount, {
      tone: "primary",
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
      { sortKey: "commissionAmount", sortType: "number" },
    ),
    col.badge<OrderGroupRow>(t("admin.operations.orders.cargoStatus"), (o) =>
      o.isGroup || !o.shipmentStatus ? (
        <span className="text-subtle">—</span>
      ) : (
        <Badge status={o.shipmentStatus} config={shipmentStatusConfig} />
      ),
    ),
    col.date<OrderGroupRow>(t("common.date"), "createdAt"),
    col.rowMenu<OrderGroupRow>(rowMenu),
  ];
}
