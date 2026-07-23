/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { StatusBadge, orderStatusConfig } from "@tarodan/ui";
import OptimizedImage from "@/components/OptimizedImage";
import { formatDate } from "@/lib/format";
import { useLocale, useTranslations } from "next-intl";
import {
  formatTL,
  getOrderPrimary,
  hasVisibleShipment,
  orderAmount,
  sellerNetOf,
  type Order,
} from "../_lib/types";
import { getDisplayStatus } from "../_lib/status";
import OrderActions, { type OrderActionHandlers } from "./OrderActions";

interface OrderCardProps {
  order: Order;
  actions: OrderActionHandlers;
  /** Compact = a grouped sub-item (smaller image + padding). */
  compact?: boolean;
}

export default function OrderCard({ order, actions, compact }: OrderCardProps) {
  const t = useTranslations();
  const locale = useLocale();
  const display = getDisplayStatus(order, t, locale);
  const { product, image } = getOrderPrimary(order);
  const net = sellerNetOf(order);
  // Çok adetli sipariş: gerçek adet + birim fiyat (satır tutarı / adet).
  const amount = orderAmount(order);
  const quantity = order.items?.[0]?.quantity ?? 1;
  const unitPrice = quantity > 0 ? amount / quantity : amount;

  return (
    <div
      className={`rounded-lg border border-border bg-surface-elevated ${
        compact ? "p-4" : "p-6"
      }`}
    >
      <div
        className={`flex items-start justify-between ${compact ? "mb-3" : "mb-4"}`}
      >
        <div>
          <p className="text-sm text-muted">
            {t("order.orderNumber")} #{order.orderNumber}
          </p>
          <p className="text-sm text-subtle">{formatDate(order.createdAt)}</p>
        </div>
        <StatusBadge
          status={display.status}
          config={orderStatusConfig}
          label={display.label}
        />
      </div>

      {product ? (
        <div className="flex items-center gap-4">
          <div
            className={`relative flex-shrink-0 overflow-hidden rounded-lg bg-surface-alt ${
              compact ? "h-12 w-12" : "h-16 w-16"
            }`}
          >
            <OptimizedImage
              src={
                image ||
                "https://placehold.co/128x128/f3f4f6/9ca3af?text=%F0%9F%9A%97"
              }
              alt={product.title}
              fill
              className="object-cover"
              fallbackSrc="https://placehold.co/128x128/f3f4f6/9ca3af?text=%F0%9F%9A%97"
              logContext={{ orderId: order.id, page: "orders" }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <Link
              href={`/listings/${product.id}`}
              className="font-medium text-heading transition-colors hover:text-primary-500"
            >
              {product.title || t("order.product")}
            </Link>
            <p className="text-sm text-muted">
              {quantity} {t("order.unitTimes")} {formatTL(unitPrice)}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-muted">{t("order.productInfoUnavailable")}</p>
      )}

      <div
        className={`flex items-center justify-between border-t border-border-subtle ${
          compact ? "mt-3 pt-3" : "mt-4 pt-4"
        }`}
      >
        <div className="text-sm text-muted">
          {order.isSeller
            ? `${t("order.buyer")}: ${order.buyer?.displayName || "-"}`
            : `${t("product.seller")}: ${order.seller?.displayName || t("product.seller")}`}
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold text-primary-500">
            {formatTL(amount)}
          </p>
          {order.isSeller && net != null && (
            <p className="mt-0.5 text-sm text-success-600">
              {t("order.netToYou")}: {formatTL(net)}
            </p>
          )}
        </div>
      </div>

      {hasVisibleShipment(order) && (
        <div className="mt-4 rounded-lg bg-surface p-3 text-sm">
          <p>
            <span className="text-muted">{t("order.shippingCompany")}:</span>{" "}
            {order.shipment!.carrier || order.shipment!.provider}
          </p>
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
