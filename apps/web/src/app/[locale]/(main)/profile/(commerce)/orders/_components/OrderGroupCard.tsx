/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import {
  StatusBadge,
  orderStatusConfig,
  Badge,
  ThumbnailStack,
} from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { useLocale, useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import {
  formatTL,
  getOrderPrimary,
  groupByPackage,
  hasVisibleShipment,
  orderAmount,
  sellerNetOf,
  type Order,
  type OrderGroup,
} from "../_lib/types";
import { getDisplayStatus } from "../_lib/status";
import OrderActions, { type OrderActionHandlers } from "./OrderActions";

const PLACEHOLDER =
  "https://placehold.co/128x128/f3f4f6/9ca3af?text=%F0%9F%9A%97";

/**
 * One product line inside the umbrella: image + title + qty×price + per-item
 * status + amount + the shared per-order actions. `showOrderNumber` is on for
 * multi carts (to tell items apart); off for a single order (the umbrella header
 * already carries the order number).
 */
function OrderLine({
  order,
  actions,
  showOrderNumber,
}: {
  order: Order;
  actions: OrderActionHandlers;
  showOrderNumber?: boolean;
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
          {showOrderNumber && (
            <p className="mt-0.5 text-xs text-subtle">
              {t("order.orderNumber")} #{order.orderNumber}
            </p>
          )}
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

      {hasVisibleShipment(order) && (
        <div className="mt-3 rounded-lg bg-surface-alt p-3 text-sm">
          <p>
            <span className="text-muted">{t("order.trackingNumber")}:</span>{" "}
            <span className="font-mono">{order.shipment!.trackingNumber}</span>
          </p>
        </div>
      )}

      <OrderActions order={order} {...actions} />
    </div>
  );
}

interface OrderGroupCardProps {
  group: OrderGroup;
  actions: OrderActionHandlers;
}

/**
 * The single "çatı" (umbrella) card for BOTH single and multi orders. The header
 * adapts to the item count; the product line(s) are ALWAYS shown beneath it — 1
 * for a single order, N for a cart — grouped per seller-package ("çatı") when the
 * cart spans multiple sellers. No accordion collapse: details are always visible.
 */
export default function OrderGroupCard({
  group,
  actions,
}: OrderGroupCardProps) {
  const t = useTranslations();
  const isMulti = group.orders.length > 1;
  const total = group.orders.reduce((sum, o) => sum + orderAmount(o), 0);
  const date = group.orders[0]?.createdAt;
  const packages = groupByPackage(group.orders);
  const multiPackage = packages.length > 1;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
      {/* Umbrella header — count-aware */}
      <div className="p-6">
        {isMulti ? (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted">
                  {t("order.multiItemOrder")}
                </p>
                <p className="text-sm text-subtle">{formatDate(date)}</p>
              </div>
              <Badge variant="outline" size="sm">
                {group.orders.length} {t("collection.items")}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <ThumbnailStack
                items={group.orders}
                getKey={(o) => o.id}
                max={4}
                size="lg"
                renderItem={(o) => {
                  const { image } = getOrderPrimary(o);
                  return (
                    <OptimizedImage
                      src={image || PLACEHOLDER}
                      alt=""
                      fill
                      className="object-cover"
                      fallbackSrc={PLACEHOLDER}
                      logContext={{ orderId: o.id, page: "orders-group" }}
                    />
                  );
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-heading">
                  {t("order.cartOfItems", { count: group.orders.length })}
                </p>
                <p className="text-sm text-muted">
                  {t("order.shipsPerSellerPackage")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted">{t("common.total")}</p>
                <p className="text-lg font-semibold text-primary-500">
                  {formatTL(total)}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">
                {t("order.orderNumber")} #{group.orders[0]?.orderNumber}
              </p>
              <p className="text-sm text-subtle">{formatDate(date)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Body — always-visible product line(s) */}
      <div className="border-t border-border-subtle p-4 sm:p-6">
        {multiPackage ? (
          <div className="space-y-4">
            {packages.map((pkg) => (
              <div
                key={pkg.key}
                className="ml-3 border-l-2 border-primary-300 pl-4"
              >
                <p className="mb-2 text-sm font-medium text-heading">
                  {pkg.seller?.displayName
                    ? t("order.sellerPackage", { name: pkg.seller.displayName })
                    : t("order.multiItemOrder")}
                </p>
                <div className="space-y-3">
                  {pkg.orders.map((order) => (
                    <OrderLine
                      key={order.id}
                      order={order}
                      actions={actions}
                      showOrderNumber
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {group.orders.map((order) => (
              <OrderLine
                key={order.id}
                order={order}
                actions={actions}
                showOrderNumber={isMulti}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
