/** @format */

"use client";

import { useTranslations } from "next-intl";
import { FormInput } from "@tarodan/ui/form";
import { SectionCard } from "@/components/ui";

interface PricingCardProps {
  locale: string;
  commissionPreview: {
    sellerFeeAmount: number;
    sellerNetAmount: number;
  } | null;
  commissionPreviewLoading: boolean;
  /** Stock-quantity placeholder + helper differ between new ("1") and edit ("unlimited"). */
  quantityPlaceholder: string;
  quantityHelper: string;
}

const fmt = (n: number) =>
  n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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
        <div className="mt-4 p-3 bg-surface rounded-xl border border-border-subtle text-sm">
          <p className="text-muted font-medium mb-1">
            {t("product.estimatedPerSale")}
          </p>
          {commissionPreviewLoading ? (
            <span className="text-subtle">{t("product.calculating")}</span>
          ) : commissionPreview ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted">
                {t("product.platformDeduction")}: ₺
                {fmt(commissionPreview.sellerFeeAmount)}
              </span>
              <span className="text-success-700 font-medium">
                {t("product.netToYou")}: ₺
                {fmt(commissionPreview.sellerNetAmount)}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
