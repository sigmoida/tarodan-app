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

/** Per-sale summary shown to the seller: only the net take-home ("elde kalan"),
 *  with all commission/withholding deductions already folded in, plus the
 *  (buyer-paid) shipping fee line. No itemised commission/list-price rows. */
function PricingBreakdown({
  preview,
}: {
  preview: NonNullable<PricingCardProps["commissionPreview"]>;
}) {
  const t = useTranslations();
  const { shippingAmount, sellerNetAmount } = preview;

  return (
    <div className="space-y-2">
      <Row
        label={t("product.netToYou")}
        value={fmt(sellerNetAmount)}
        tone="net"
      />
      <Row label={t("product.shippingLine")} value={fmt(shippingAmount)} />
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
