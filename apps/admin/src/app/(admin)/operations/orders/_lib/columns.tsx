import Link from "next/link";
import {
  Button,
  Badge,
  orderStatusConfig,
  shipmentStatusConfig,
} from "@tarodan/ui";
import {
  ShoppingBagIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
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
import { type Order } from "./orders";

type T = ReturnType<typeof useTranslations<never>>;

export interface OrderColumnProps {
  t: T;
  expandedGroups: Set<string>;
  toggleGroup: (gid: string) => void;
  rowMenu: (o: Order) => RowActionItem[];
}

export function orderColumns({
  t,
  expandedGroups,
  toggleGroup,
  rowMenu,
}: OrderColumnProps) {
  return [
    col.custom<Order>(
      t("admin.operations.orders.orderNumber"),
      (o) => {
        if (o.isGroupSummary && o.checkoutGroupId) {
          const gid = o.checkoutGroupId;
          const isOpen = expandedGroups.has(gid);
          return (
            <Button
              type="button"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                toggleGroup(gid);
              }}
              aria-expanded={isOpen}
              title={
                isOpen
                  ? t("admin.operations.orders.collapseCart")
                  : t("admin.operations.orders.expandCart")
              }
              className="-mx-1 h-auto w-fit gap-1 rounded px-1 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary-600 hover:bg-primary-100 hover:text-primary-700"
            >
              <ShoppingBagIcon className="h-3.5 w-3.5" />
              {t("admin.operations.orders.cartItems", {
                count: o.groupItemCount,
              })}
              {isOpen ? (
                <ChevronUpIcon className="h-3.5 w-3.5" />
              ) : (
                <ChevronDownIcon className="h-3.5 w-3.5" />
              )}
            </Button>
          );
        }
        return (
          <Link
            href={`/operations/orders/${o.id}`}
            className="block truncate font-mono text-sm text-primary-600 hover:underline"
          >
            {o.orderNumber}
          </Link>
        );
      },
      {
        grow: 2,
        minWidth: 150,
        sortKey: "orderNumber",
        sortType: "text",
      },
    ),
    col.custom<Order>(
      t("common.status"),
      (o) =>
        o.isGroupSummary ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              o.groupStatus === "done"
                ? "bg-success-100 text-success-700"
                : "bg-info-100 text-info-700"
            }`}
          >
            {o.groupStatus === "done"
              ? t("admin.operations.orders.groupDone")
              : t("admin.operations.orders.groupOngoing")}
          </span>
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
    col.user<Order>(
      t("admin.operations.orders.buyer"),
      (o) => ({
        name: o.buyer.displayName,
        href: `/accounts/users/${o.buyer.id}`,
      }),
      { sortKey: "buyer.displayName", sortType: "text" },
    ),
    col.custom<Order>(
      t("admin.operations.orders.seller"),
      (o) => {
        if (o.isGroupSummary) {
          const sellers = o.groupSellers ?? [];
          const first = sellers[0];
          const extra = Math.max(0, sellers.length - 1);
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
        return (
          <CellUser
            name={o.seller.displayName}
            href={`/accounts/users/${o.seller.id}`}
          />
        );
      },
      { sortKey: "seller.displayName", sortType: "text" },
    ),
    col.id<Order>(t("admin.operations.orders.sellerId"), (o) =>
      o.isGroupSummary ? undefined : o.seller.id,
    ),
    col.custom<Order>(
      t("admin.catalog.common.product"),
      (o) => {
        if (o.isGroupSummary) {
          const thumbs = o.groupThumbs ?? [];
          const extra = o.groupItemCount - thumbs.length;
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
        }
        return (
          <CellText
            value={
              o.product?.title ||
              t("admin.operations.orders.itemCountUnit", { count: o.itemCount })
            }
          />
        );
      },
      { grow: 2, sortKey: "product.title", sortType: "text" },
    ),
    col.money<Order>(
      t("common.amount"),
      (o) => (o.isGroupSummary ? (o.groupTotalAmount ?? 0) : o.totalAmount),
      { tone: "primary", sortKey: "totalAmount", sortType: "number" },
    ),
    col.custom<Order>(
      t("admin.operations.orders.commission"),
      (o) => {
        const amount = o.isGroupSummary
          ? (o.groupCommission ?? 0)
          : o.commission;
        const base = o.isGroupSummary ? 0 : o.subtotal;
        const rate = base > 0 ? Math.round((amount / base) * 100) : null;
        return (
          <span className="whitespace-nowrap tabular-nums">
            <span className="font-medium text-success-600">
              {fmtTry(amount)}
            </span>
            {rate != null && (
              <span className="ml-1 text-xs text-muted">%{rate}</span>
            )}
          </span>
        );
      },
      { sortKey: "commissionAmount", sortType: "number" },
    ),
    col.badge<Order>(t("admin.operations.orders.cargoStatus"), (o) =>
      o.isGroupSummary || !o.shipmentStatus ? (
        <span className="text-subtle">—</span>
      ) : (
        <Badge status={o.shipmentStatus} config={shipmentStatusConfig} />
      ),
    ),
    col.date<Order>(t("common.date"), "createdAt"),
    col.rowMenu<Order>(rowMenu),
  ];
}
