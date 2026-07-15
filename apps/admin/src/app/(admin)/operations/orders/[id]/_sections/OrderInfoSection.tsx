"use client";

import { useTranslations } from "next-intl";
import { AdminFinancialSummary } from "../_components/AdminFinancialSummary";
import { SectionCard } from "@/components/detail/SectionCard";
import type { OrderDetail } from "../types";
import type { OrderStatusView } from "../_lib/status";

export function OrderInfoSection({
  order,
  status,
}: {
  order: OrderDetail;
  status: OrderStatusView;
}) {
  const t = useTranslations();
  return (
    <SectionCard
      title={t("admin.operations.orders.infoTitle")}
      bodyClassName="space-y-4"
    >
      <div>
        <span className="text-sm text-muted">{t("common.status")}:</span>
        <p className="font-medium text-heading">{status.label}</p>
      </div>
      <div className="border-t border-border pt-4">
        <AdminFinancialSummary
          pricing={
            order.pricing
              ? {
                  ...order.pricing,
                  discountAmount: order.discountAmount,
                  discountCode: order.discountCode,
                }
              : undefined
          }
          fallback={{
            subtotal: order.subtotal,
            shippingCost: order.shippingCost,
            buyerFeeAmount: order.buyerFeeAmount,
            sellerFeeAmount: order.sellerFeeAmount,
            commissionAmount: order.commissionAmount,
            totalAmount: order.totalAmount,
            sellerNetAmount: order.sellerNetAmount,
            discountAmount: order.discountAmount,
            discountCode: order.discountCode,
          }}
        />
      </div>
    </SectionCard>
  );
}
