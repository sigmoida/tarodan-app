/** @format */

"use client";

import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { Radio } from "@tarodan/ui";
import { FormInput } from "@tarodan/ui/form";
import { SectionCard } from "@/components/ui";
import {
  usePackageTiers,
  sampleDimensionsLabel,
  type PackageTierCode,
} from "../usePackageTiers";

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

      <PackageSizePicker />

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

/**
 * Kargo girdisi: satıcı desi yazmaz, üç paket boyutundan birini seçer. Kartlar
 * aktif tarifeden gelir (etiket + tam kargo bedeli + örnek ölçü); desi arayüzde
 * hiç görünmez. Seçim, altındaki "size kalan" önizlemesini canlı günceller.
 */
function PackageSizePicker() {
  const t = useTranslations();
  const { setValue, watch } = useFormContext();
  const { tiers, tiersLoading } = usePackageTiers();
  const selected = watch("shippingPackageTier") as PackageTierCode;

  return (
    <div className="mt-4">
      <p className="mb-1 text-sm font-medium text-heading">
        {t("product.packageSize")}
      </p>
      <p className="mb-3 text-xs text-muted">
        {t("product.packageSizeHelper")}
      </p>

      {tiersLoading ? (
        <p className="text-sm text-subtle">{t("product.calculating")}</p>
      ) : tiers.length === 0 ? (
        <p className="text-sm text-danger-700">
          {t("product.packageSizeUnavailable")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {tiers.map((tier) => {
            const dimensions = sampleDimensionsLabel(tier);
            const isSelected = selected === tier.code;
            return (
              <label
                key={tier.code}
                className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-4 transition ${
                  isSelected
                    ? "border-primary-500 bg-primary-50"
                    : "border-border hover:border-border-strong"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Radio
                    name="shippingPackageTier"
                    value={tier.code}
                    checked={isSelected}
                    onChange={() =>
                      setValue("shippingPackageTier", tier.code, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  />
                  <span className="font-medium text-heading">{tier.label}</span>
                </span>
                <span className="text-sm font-semibold text-primary-600">
                  {fmt(tier.amount)}
                </span>
                {dimensions && (
                  <span className="text-xs text-muted">
                    {t("product.sampleDimensions", { dimensions })}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Satıcıya gösterilen satış başına özet: TAM İKİ SATIR — üstte satıcının
 * üstlendiği kargo ücreti, altta hak ediş. Komisyon/KDV/stopaj kalemleri hak
 * edişin içinde katlanmış durumda; bu ekranda satıcının sorduğu iki soru var:
 * "kargoya ne ödeyeceğim" ve "elime ne geçecek".
 *
 * Kargo payı 0 olduğunda satır GİZLENMEZ, ₺0,00 gösterilir: satır kaybolunca
 * satıcı kargonun sıfır mı olduğunu yoksa hesaba hiç katılmadığını mı bilemiyor.
 */
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
        label={t("product.shippingFee")}
        value={fmt(shippingAmount)}
        tone={shippingAmount > 0 ? "deduction" : "default"}
      />
      <Row
        label={t("product.sellerEarning")}
        value={fmt(sellerNetAmount)}
        tone="net"
      />
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
