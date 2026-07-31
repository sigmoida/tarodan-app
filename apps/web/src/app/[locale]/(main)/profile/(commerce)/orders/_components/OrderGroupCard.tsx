/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { StatusBadge, orderStatusConfig } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import { Button } from "@tarodan/ui";
import {
  formatTL,
  getOrderPrimary,
  isGroupCancellable,
  orderAmount,
  sellerNetOf,
  visibleCargoCode,
  type Order,
  type ServerOrderGroup,
} from "../_lib/types";
import { getDisplayStatus } from "../_lib/status";
import OrderActions, { type OrderActionHandlers } from "./OrderActions";

const PLACEHOLDER =
  "https://placehold.co/128x128/f3f4f6/9ca3af?text=%F0%9F%9A%97";

/**
 * One product line inside the umbrella: image + title + qty×price + per-item
 * status + amount + the shared per-order actions.
 */
function OrderLine({
  order,
  actions,
}: {
  order: Order;
  actions: OrderActionHandlers;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const display = getDisplayStatus(order, t, locale);
  const { product, image } = getOrderPrimary(order);
  const amount = orderAmount(order);
  const net = sellerNetOf(order);
  const quantity = order.items?.[0]?.quantity ?? 1;
  const unitPrice = quantity > 0 ? amount / quantity : amount;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-4">
        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt">
          <OptimizedImage
            src={image || PLACEHOLDER}
            alt={product?.title ?? ""}
            fill
            className="object-cover"
            fallbackSrc={PLACEHOLDER}
            logContext={{ orderId: order.id, page: "orders-line" }}
          />
        </div>
        <div className="min-w-0 flex-1">
          {product ? (
            <Link
              href={`/listings/${product.id}`}
              className="font-medium text-heading transition-colors hover:text-primary-600"
            >
              {product.title || t("order.product")}
            </Link>
          ) : (
            <p className="text-muted">{t("order.productInfoUnavailable")}</p>
          )}
          <p className="text-sm text-muted">
            {quantity} {t("order.unitTimes")} {formatTL(unitPrice)}
          </p>
          <p className="mt-0.5 text-xs text-subtle">
            {t("order.orderNumber")} #{order.orderNumber}
          </p>
          <p className="mt-1.5 text-sm text-muted">
            {order.isSeller
              ? `${t("order.buyer")}: ${order.buyer?.displayName || "-"}`
              : `${t("product.seller")}: ${order.seller?.displayName || t("product.seller")}`}
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
          <StatusBadge
            status={display.status}
            config={orderStatusConfig}
            label={display.label}
            size="sm"
          />
          <p className="text-base font-semibold text-primary-500">
            {formatTL(amount)}
          </p>
          {order.isSeller && net != null && (
            <p className="text-xs text-success-600">
              {t("order.netToYou")}: {formatTL(net)}
            </p>
          )}
        </div>
      </div>

      <OrderActions order={order} {...actions} />
    </div>
  );
}

interface OrderGroupCardProps {
  group: ServerOrderGroup;
  actions: OrderActionHandlers;
  /** Grup iptali (R4): iptal SEPET bazındadır — kartta tek buton. */
  onCancelGroup: (group: ServerOrderGroup) => void;
}

/**
 * The single "çatı" (umbrella) card for BOTH single and multi orders — now fed
 * by the server group row: packages carry the per-parcel shipping fee + shared
 * cargo, `payment` is the ONE charge of the whole cart (buyer view only).
 */
export default function OrderGroupCard({
  group,
  actions,
  onCancelGroup,
}: OrderGroupCardProps) {
  const t = useTranslations();
  const date = group.createdAt;
  const multiPackage = group.packages.length > 1;
  // Satıcı çatısında sepet numarasının yanında paketin kargo referansı da
  // gösterilir; ikisi aynıysa (sepetsiz sipariş) tek numara kalır.
  const packageRef =
    group.packageRef && group.packageRef !== group.groupNumber
      ? group.packageRef
      : null;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
      {/* Umbrella header — tek ve çok ürünlü sepette aynı düzen */}
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-sm text-muted">
              {group.groupNumber}
              {packageRef && (
                <span className="text-subtle"> · {packageRef}</span>
              )}
            </p>
            <p className="text-sm text-subtle">{formatDate(date)}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted">{t("common.total")}</p>
              <p className="text-lg font-semibold text-primary-500">
                {formatTL(group.totalAmount)}
              </p>
            </div>
            {isGroupCancellable(group) && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => onCancelGroup(group)}
              >
                {group.orders.length > 1
                  ? t("order.cancelGroupTitle")
                  : t("order.cancelShort")}
              </Button>
            )}
            <ButtonLink
              href={`/profile/orders/${group.orders[0]?.id}`}
              variant="outline"
              size="sm"
            >
              {t("common.details")}
            </ButtonLink>
          </div>
        </div>
      </div>

      {/* Body — product line(s) grouped per seller-package ("çatı"). Same seller =
          one parcel = ONE tracking + ONE shipping fee, shown once per package. */}
      <div className="space-y-4 border-t border-border-subtle p-4 sm:p-6">
        {group.packages.map((pkg) => {
          const cargoCode = visibleCargoCode(pkg.cargo);
          return (
            <div
              key={pkg.id}
              className={
                multiPackage ? "ml-3 border-l-2 border-primary-300 pl-4" : ""
              }
            >
              {multiPackage && (
                <p className="mb-2 text-sm font-medium text-heading">
                  {pkg.seller?.displayName
                    ? t("order.sellerPackage", { name: pkg.seller.displayName })
                    : t("order.multiItemOrder")}
                </p>
              )}
              <div className="space-y-3">
                {pkg.orders.map((order) => (
                  <OrderLine key={order.id} order={order} actions={actions} />
                ))}
              </div>
              {(cargoCode || pkg.shippingCost > 0) && (
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-surface-alt p-3 text-sm">
                  {cargoCode && (
                    <p>
                      <span className="text-muted">
                        {t("order.trackingNumber")}:
                      </span>{" "}
                      <span className="font-mono">{cargoCode}</span>
                    </p>
                  )}
                  {pkg.shippingCost > 0 && (
                    <p>
                      <span className="text-muted">
                        {t("checkout.shipping")}:
                      </span>{" "}
                      {formatTL(pkg.shippingCost)}
                    </p>
                  )}
                  {/* Takip PAKET başına tektir — koli/barkod paylaşılır (R6). */}
                  {cargoCode && group.viewerRole === "buyer" && (
                    <ButtonLink
                      href={`/track-order?orderNumber=${encodeURIComponent(
                        pkg.orders[0]?.orderNumber ?? "",
                      )}&email=${encodeURIComponent(actions.userEmail || "")}`}
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                    >
                      {t("order.trackOrder")}
                    </ButtonLink>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
