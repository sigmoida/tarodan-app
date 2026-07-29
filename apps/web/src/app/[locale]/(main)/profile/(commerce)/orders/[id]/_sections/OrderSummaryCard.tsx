/** @format */

"use client";

import { SectionCard } from "@/components/ui";
import { formatPriceNumber, formatTL } from "@/lib/format";
import { useTranslations } from "next-intl";
import {
  isMembershipOrder,
  orderAmountOf,
  type OrderDetail,
} from "../_lib/types";

export default function OrderSummaryCard({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const orderAmount = orderAmountOf(order);
  const p = order.pricing;

  const subtotal =
    p?.subtotal ??
    orderAmount -
      (p?.shippingAmount ?? order.shippingCost ?? 0) -
      (p?.buyerFeeAmount ?? order.buyerFeeAmount ?? 0);
  const shippingAmount = p?.shippingAmount ?? order.shippingCost ?? 0;
  const buyerFee = p?.buyerFeeAmount ?? order.buyerFeeAmount ?? 0;
  const sellerFee = p?.sellerFeeAmount ?? order.sellerFeeAmount ?? 0;

  return (
    <SectionCard title={t("checkout.orderSummary")}>
      <div className="space-y-3">
        <div className="flex justify-between text-muted">
          <span>{t("order.productAmount")}</span>
          <span>₺{formatPriceNumber(subtotal)}</span>
        </div>
        {/* KDV: yalnızca kurumsal satıcıda (taxAmount > 0) ayrı satır */}
        {(p?.taxAmount ?? 0) > 0 && (
          <div className="flex justify-between text-muted">
            <span>{t("order.vat")}</span>
            <span>₺{formatPriceNumber(p?.taxAmount ?? 0)}</span>
          </div>
        )}
        {/* Üyelik/dijital siparişlerde kargo satırı yoktur */}
        {!isMembershipOrder(order) && (
          <div className="flex justify-between text-muted">
            <span>{t("checkout.shipping")}</span>
            <span>
              {shippingAmount > 0
                ? `₺${formatPriceNumber(shippingAmount)}`
                : order.packageId
                  ? /* Satıcı paketi kardeşi: kargo pakette bir kez ödendi, bu order 0 →
                       "Ücretsiz" YANLIŞ olur; kargo pakete dahildir. */
                    t("order.shippingIncludedInPackage")
                  : t("membership.free")}
            </span>
          </div>
        )}
        {buyerFee > 0 && (
          <div className="flex justify-between text-muted">
            <span>{t("order.platformFee")}</span>
            <span>₺{formatPriceNumber(buyerFee)}</span>
          </div>
        )}
        {order.isSeller && (sellerFee > 0 || p?.sellerNetAmount != null) && (
          <>
            <div className="flex justify-between text-muted">
              <span>{t("order.platformDeduction")}</span>
              <span>₺{formatPriceNumber(sellerFee)}</span>
            </div>
            {/* Stopaj: yalnızca kurumsal satıcıda (>0). GVK 94/19 — satıcı beyannamede mahsup eder. */}
            {(p?.withholdingTaxAmount ?? 0) > 0 && (
              <div className="flex justify-between text-muted">
                <span>{t("order.withholdingTax")}</span>
                <span>₺{formatPriceNumber(p?.withholdingTaxAmount ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between text-success-700 font-medium">
              <span>{t("order.netToYou")}</span>
              <span>
                ₺
                {formatPriceNumber(
                  p?.sellerNetAmount ??
                    (p?.subtotal ?? orderAmount) - sellerFee,
                )}
              </span>
            </div>
          </>
        )}
        <div className="border-t pt-3 flex justify-between font-semibold text-lg">
          <span>{t("common.total")}</span>
          <span className="text-primary-500">{formatTL(orderAmount)}</span>
        </div>
      </div>
    </SectionCard>
  );
}
