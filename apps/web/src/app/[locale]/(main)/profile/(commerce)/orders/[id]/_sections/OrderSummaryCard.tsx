/** @format */

"use client";

import { SectionCard } from "@/components/ui";
import { formatPriceNumber, formatTL } from "@/lib/format";
import { useTranslations } from "next-intl";
import {
  buyerOrderSummaryOf,
  isMembershipOrder,
  sellerOrderSummaryOf,
  type OrderDetail,
} from "../_lib/types";

/**
 * Siparişin para özeti — alıcıya ödediğinin, satıcıya hak ettiğinin kırılımı.
 *
 * Tutarların hiçbiri burada türetilmez: satırlar `buyerOrderSummaryOf` /
 * `sellerOrderSummaryOf` ile hesaplanır (KDV dağıtım kuralı ve neden öyle
 * olduğu orada yazılı) ve bu bileşen yalnız basar.
 */
export default function OrderSummaryCard({ order }: { order: OrderDetail }) {
  if (order.isSeller && !isMembershipOrder(order)) {
    return <SellerSummary order={order} />;
  }
  return <BuyerSummary order={order} />;
}

function SellerSummary({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const s = sellerOrderSummaryOf(order);
  const feeDiscount = order.pricing?.sellerFeeDiscountAmount ?? 0;

  return (
    <SectionCard title={t("checkout.orderSummary")}>
      <div className="space-y-3">
        <div className="flex justify-between text-muted">
          <span>{t("order.productAmount")}</span>
          <span>₺{formatPriceNumber(s.productAmount)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>{t("order.shippingDeduction")}</span>
          <span>₺{formatPriceNumber(s.shippingDeduction)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>{t("order.serviceFeeDeduction")}</span>
          <span>₺{formatPriceNumber(s.serviceFeeDeduction)}</span>
        </div>
        {s.withholdingTax > 0 && (
          <div className="flex justify-between text-muted">
            <span>{t("order.withholdingTax")}</span>
            <span>₺{formatPriceNumber(s.withholdingTax)}</span>
          </div>
        )}
        {/* Platformun satıcı tarafına verdiği bedel indirimi kesintiyi zaten
            küçültmüştür; bu satır avantajın KAYNAĞINI söyler. */}
        {feeDiscount > 0 && (
          <div className="flex justify-between text-success-600">
            <span>{t("order.sellerCampaignAdvantage")}</span>
            <span>+₺{formatPriceNumber(feeDiscount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t pt-3 text-lg font-semibold">
          <span>{t("order.sellerPayout")}</span>
          <span className="text-success-700">{formatTL(s.payout)}</span>
        </div>
      </div>
    </SectionCard>
  );
}

function BuyerSummary({ order }: { order: OrderDetail }) {
  const t = useTranslations();
  const s = buyerOrderSummaryOf(order);

  return (
    <SectionCard title={t("checkout.orderSummary")}>
      <div className="space-y-3">
        <div className="flex justify-between text-muted">
          <span>{t("order.productAmount")}</span>
          <span>₺{formatPriceNumber(s.productAmount)}</span>
        </div>
        {/* Üyelik/dijital siparişlerde kargo satırı yoktur */}
        {!isMembershipOrder(order) && (
          <div className="flex justify-between text-muted">
            <span>{t("checkout.shipping")}</span>
            <span>
              {s.shippingAmount > 0
                ? `₺${formatPriceNumber(s.shippingAmount)}`
                : order.packageId
                  ? /* Satıcı paketi kardeşi: kargo pakette bir kez ödendi, bu order 0 →
                       "Ücretsiz" YANLIŞ olur; kargo pakete dahildir. */
                    t("order.shippingIncludedInPackage")
                  : t("membership.free")}
            </span>
          </div>
        )}
        {s.serviceFeeAmount > 0 && (
          <div className="flex justify-between text-muted">
            <span>{t("order.serviceFee")}</span>
            <span>₺{formatPriceNumber(s.serviceFeeAmount)}</span>
          </div>
        )}
        <div className="border-t pt-3 flex justify-between font-semibold text-lg">
          <span>{t("order.paidAmount")}</span>
          <span className="text-primary-500">{formatTL(s.paidAmount)}</span>
        </div>
      </div>
    </SectionCard>
  );
}
