/** @format */

"use client";

import { StatusBadge, orderStatusConfig } from "@tarodan/ui";
import { useLocale, useTranslations } from "next-intl";
import { formatPrice } from "@/lib/format";
import { getOrderStatusLabel, type OrderDetail } from "../_lib/types";
import OrderBanners from "./OrderBanners";
import ProductInfoCard from "./ProductInfoCard";
import RefundRequestBanner from "./RefundRequestBanner";
import SellerActions from "./SellerActions";
import EscrowInfoCard from "./EscrowInfoCard";
import ConfirmDeliverySection from "./ConfirmDeliverySection";
import ReviewCta from "./ReviewCta";
import ReviewSummary from "./ReviewSummary";
import RefundActions from "./RefundActions";
import OrderSummaryCard from "./OrderSummaryCard";
import InvoicesSection from "./InvoicesSection";

export interface OrderItemBlockHandlers {
  onReview: (order: OrderDetail) => void;
  onRequestRefund: (order: OrderDetail) => void;
}

/**
 * Grup çatısı altındaki TEK siparişin tam dosyası: ürün, banner'lar, satıcı/alıcı
 * aksiyonları, escrow, teslim onayı, iade, fiyat kırılımı ve faturalar. Ayrı bir
 * sipariş detay ekranı YOKTUR — her şey bu blokta, grup ekranının içinde yaşar.
 */
export default function OrderItemBlock({
  order,
  showHeading,
  showCargoRef = true,
  handlers,
}: {
  order: OrderDetail;
  showHeading: boolean;
  /** Paketin ilk siparişi dışındaki bloklarda kargo referans kartı gizlenir (R6). */
  showCargoRef?: boolean;
  handlers: OrderItemBlockHandlers;
}) {
  const t = useTranslations();
  const locale = useLocale();

  const hasActiveRefund = !!order.activeRefundRequest;
  const displayStatus = hasActiveRefund
    ? "refund_requested"
    : order.cancellationType === "iptal"
      ? "cancelled"
      : order.status;
  const statusLabel = hasActiveRefund
    ? t("order.refundInProgress")
    : getOrderStatusLabel(displayStatus, locale);

  return (
    <div className="space-y-6">
      {showHeading && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-2">
          <p className="font-mono text-sm text-muted">
            {t("order.orderNumber")} #{order.orderNumber}
          </p>
          <div className="flex items-center gap-3">
            <StatusBadge
              status={displayStatus}
              config={orderStatusConfig}
              label={statusLabel}
              size="sm"
            />
            <p className="text-sm font-semibold text-heading">
              {formatPrice(Number(order.totalAmount))}
            </p>
          </div>
        </div>
      )}

      <OrderBanners order={order} />
      <ProductInfoCard order={order} />
      <RefundRequestBanner order={order} />
      <SellerActions order={order} showCargoRef={showCargoRef} />
      <EscrowInfoCard order={order} />
      <ConfirmDeliverySection order={order} />
      <ReviewCta order={order} onReview={() => handlers.onReview(order)} />
      <ReviewSummary order={order} />
      <RefundActions
        order={order}
        onRequestRefund={() => handlers.onRequestRefund(order)}
      />
      <OrderSummaryCard order={order} />
      <InvoicesSection order={order} />
    </div>
  );
}
