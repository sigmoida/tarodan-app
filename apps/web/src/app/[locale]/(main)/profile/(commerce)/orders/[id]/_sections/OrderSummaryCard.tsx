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
  const vatRate = p?.serviceVatRate ?? 0;
  const money = (value: number) => Math.round(value * 100) / 100;
  const buyerServiceTax =
    p?.buyerServiceTaxAmount ??
    Math.max(0, money(orderAmount - subtotal - shippingAmount - buyerFee));
  const sellerShippingAmount = p?.sellerShippingAmount ?? 0;
  const sellerServiceTax = p?.sellerServiceTaxAmount ?? 0;
  const buyerShippingVat =
    vatRate > 0 ? money(shippingAmount * (vatRate / 100)) : 0;
  const sellerShippingVat =
    vatRate > 0 ? money(sellerShippingAmount * (vatRate / 100)) : 0;
  const grossBuyerShipping = money(shippingAmount + buyerShippingVat);
  const grossBuyerFee = money(
    buyerFee + Math.max(0, buyerServiceTax - buyerShippingVat),
  );
  const grossSellerShipping = money(sellerShippingAmount + sellerShippingVat);
  const grossSellerFee = money(
    sellerFee + Math.max(0, sellerServiceTax - sellerShippingVat),
  );
  const sellerProductAmount = money(subtotal + (p?.taxAmount ?? 0));

  if (order.isSeller && !isMembershipOrder(order)) {
    return (
      <SectionCard title={t("checkout.orderSummary")}>
        <div className="space-y-3">
          <div className="flex justify-between text-muted">
            <span>{t("order.productAmount")}</span>
            <span>₺{formatPriceNumber(sellerProductAmount)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>{t("order.shippingDeduction")}</span>
            <span>₺{formatPriceNumber(grossSellerShipping)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>{t("order.serviceFeeDeduction")}</span>
            <span>₺{formatPriceNumber(grossSellerFee)}</span>
          </div>
          {(p?.withholdingTaxAmount ?? 0) > 0 && (
            <div className="flex justify-between text-muted">
              <span>{t("order.withholdingTax")}</span>
              <span>₺{formatPriceNumber(p?.withholdingTaxAmount ?? 0)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-3 text-lg font-semibold">
            <span>{t("order.sellerPayout")}</span>
            <span className="text-success-700">
              {formatTL(
                p?.sellerNetAmount ??
                  sellerProductAmount -
                    grossSellerShipping -
                    grossSellerFee -
                    (p?.withholdingTaxAmount ?? 0),
              )}
            </span>
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t("checkout.orderSummary")}>
      <div className="space-y-3">
        <div className="flex justify-between text-muted">
          <span>{t("order.productAmount")}</span>
          <span>₺{formatPriceNumber(subtotal)}</span>
        </div>
        {/* Üyelik/dijital siparişlerde kargo satırı yoktur */}
        {!isMembershipOrder(order) && (
          <div className="flex justify-between text-muted">
            <span>{t("checkout.shipping")}</span>
            <span>
              {grossBuyerShipping > 0
                ? `₺${formatPriceNumber(grossBuyerShipping)}`
                : order.packageId
                  ? /* Satıcı paketi kardeşi: kargo pakette bir kez ödendi, bu order 0 →
                       "Ücretsiz" YANLIŞ olur; kargo pakete dahildir. */
                    t("order.shippingIncludedInPackage")
                  : t("membership.free")}
            </span>
          </div>
        )}
        {grossBuyerFee > 0 && (
          <div className="flex justify-between text-muted">
            <span>{t("order.serviceFee")}</span>
            <span>₺{formatPriceNumber(grossBuyerFee)}</span>
          </div>
        )}
        <div className="border-t pt-3 flex justify-between font-semibold text-lg">
          <span>{t("order.paidAmount")}</span>
          <span className="text-primary-500">{formatTL(orderAmount)}</span>
        </div>
      </div>
    </SectionCard>
  );
}
