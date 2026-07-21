/** @format */

"use client";

import { useTranslations } from "next-intl";
import { FormInput } from "@tarodan/ui/form";
import { SectionCard } from "@/components/ui";

interface PricingCardProps {
  locale: string;
  commissionPreview: {
    sellerFeeAmount: number;
    withholdingTaxAmount: number;
    shippingAmount: number;
    sellerNetAmount: number;
  } | null;
  commissionPreviewLoading: boolean;
  /** Stock-quantity placeholder + helper differ between new ("1") and edit ("unlimited"). */
  quantityPlaceholder: string;
  quantityHelper: string;
}

const fmt = (n: number) =>
  `₺${n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** "Fiyatlandırma" — price + stock quantity + commission preview. Shared. */
export default function PricingCard({
  commissionPreview,
  commissionPreviewLoading,
  quantityPlaceholder,
  quantityHelper,
}: PricingCardProps) {
  const t = useTranslations();
  return (
    <SectionCard title={t("product.pricing")}>
      <div className="grid md:grid-cols-2 gap-4">
        <FormInput
          name="price"
          type="number"
          label={t("product.priceLabel")}
          placeholder="0.00"
          min={1}
          max={9999999}
          step="0.01"
        />
        <FormInput
          name="quantity"
          type="number"
          label={t("product.stockQuantity")}
          placeholder={quantityPlaceholder}
          min={1}
          helperText={quantityHelper}
        />
      </div>

      {(commissionPreviewLoading || commissionPreview) && (
        <div className="mt-4 p-4 bg-surface rounded-xl border border-border-subtle text-sm">
          <p className="text-muted font-medium mb-3">
            {t("product.estimatedPerSale")}
          </p>
          {commissionPreviewLoading ? (
            <span className="text-subtle">{t("product.calculating")}</span>
          ) : commissionPreview ? (
            <PricingBreakdown preview={commissionPreview} />
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

/** Itemized per-sale breakdown: list price → commission/withholding deductions →
 *  net, plus a buyer-paid shipping note. The entered price is reconstructed from
 *  the preview (net + fees) so no extra prop threading is needed. */
function PricingBreakdown({
  preview,
}: {
  preview: NonNullable<PricingCardProps["commissionPreview"]>;
}) {
  const t = useTranslations();
  const {
    sellerFeeAmount,
    withholdingTaxAmount,
    shippingAmount,
    sellerNetAmount,
  } = preview;
  const listPrice = sellerNetAmount + sellerFeeAmount + withholdingTaxAmount;

  return (
    <div className="space-y-2">
      <Row label={t("product.listPriceLine")} value={fmt(listPrice)} />
      <Row
        label={t("product.commissionLine")}
        value={`−${fmt(sellerFeeAmount)}`}
        tone="deduction"
      />
      {withholdingTaxAmount > 0 && (
        <Row
          label={t("product.platformDeduction")}
          value={`−${fmt(withholdingTaxAmount)}`}
          tone="deduction"
        />
      )}
      <div className="my-2 border-t border-border-subtle" />
      <Row
        label={t("product.netToYou")}
        value={fmt(sellerNetAmount)}
        tone="net"
      />
      <p className="pt-2 text-xs text-subtle">
        {t("product.shippingBuyerPaidHint", { amount: fmt(shippingAmount) })}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "deduction" | "net";
}) {
  const labelClass =
    tone === "net" ? "text-heading font-semibold" : "text-muted";
  const valueClass =
    tone === "net"
      ? "text-success-700 font-semibold"
      : tone === "deduction"
        ? "text-danger-700"
        : "text-heading font-medium";
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={labelClass}>{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}
