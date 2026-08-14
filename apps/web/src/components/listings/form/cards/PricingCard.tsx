/** @format */

"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { CheckIcon } from "@heroicons/react/24/solid";
import { Radio, cn } from "@tarodan/ui";
import { FormInput } from "@tarodan/ui/form";
import { SectionCard } from "@/components/ui";
import { formatTL } from "@/lib/format";
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
  commissionPreviewError?: unknown;
  /** Stock-quantity placeholder + helper differ between new ("1") and edit ("unlimited"). */
  quantityPlaceholder: string;
  quantityHelper: string;
}

// Para biçimi TEK yerden gelir (`lib/format`): ekranlar kendi
// `toLocaleString` çağrılarını yazdığında aynı ürün bir kartta "468 ₺",
// detayda "468,19 TL" görünüyor ve kart biçimi kuruşu YUVARLIYORDU.
const fmt = formatTL;

/** "Fiyatlandırma" — price + stock quantity + commission preview. Shared. */
export default function PricingCard({
  commissionPreview,
  commissionPreviewLoading,
  commissionPreviewError,
  quantityPlaceholder,
  quantityHelper,
}: PricingCardProps) {
  const t = useTranslations();
  return (
    <SectionCard title={t("product.pricing")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      {(commissionPreviewLoading ||
        commissionPreview ||
        Boolean(commissionPreviewError)) && (
        <div className="mt-4 p-4 bg-surface rounded-xl border border-border-subtle text-sm">
          <p className="text-muted font-medium mb-3">
            {t("product.estimatedPerSale")}
          </p>
          {commissionPreviewLoading ? (
            <span className="text-subtle">{t("product.calculating")}</span>
          ) : commissionPreviewError ? (
            <span className="text-danger-700">
              {t("product.commissionRuleUnavailable")}
            </span>
          ) : commissionPreview ? (
            <PricingBreakdown preview={commissionPreview} />
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

/**
 * Kademe görselleri. Kademe kodları sabit (small/medium/large) olduğu için
 * statik: admin etiketi değiştirse de kutu görseli boyutu temsil etmeye devam
 * eder. Şeffaf WebP — kart zemini seçili/seçili değil durumunda değişiyor.
 */
const TIER_IMAGE: Record<PackageTierCode, string> = {
  small: "/package-tiers/small.webp",
  medium: "/package-tiers/medium.webp",
  large: "/package-tiers/large.webp",
};

/**
 * Kargo girdisi: satıcı desi yazmaz, üç paket boyutundan birini seçer. Kartlar
 * aktif tarifeden gelir (etiket + tam kargo bedeli + örnek ölçü); desi arayüzde
 * hiç görünmez. Seçim, altındaki "size kalan" önizlemesini canlı günceller.
 *
 * Kutu görseli kararın ASIL yardımcısı: satıcı "ürünüm bu koliye sığar mı"
 * sorusunu ölçü metninden önce gözüyle cevaplıyor. Bu yüzden görsel kartın
 * merkezinde, ücret ve örnek ölçü onun altında kendi bloklarında durur.
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiers.map((tier) => (
            <PackageSizeOption
              key={tier.code}
              label={tier.label}
              code={tier.code}
              amount={tier.amount}
              dimensions={sampleDimensionsLabel(tier)}
              isSelected={selected === tier.code}
              onSelect={() =>
                setValue("shippingPackageTier", tier.code, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Tek paket boyutu kartı.
 *
 * Dar ekranda satır düzeni (görsel solda, bilgiler sağda): üç kartı alt alta
 * dizmek formu gereksiz uzatıyordu, yatay düzen üçünü de tek bakışta bırakır.
 * `sm` ve üstünde referans tasarımdaki dikey sütuna döner.
 */
function PackageSizeOption({
  label,
  code,
  amount,
  dimensions,
  isSelected,
  onSelect,
}: {
  label: string;
  code: PackageTierCode;
  amount: number;
  dimensions: string | null;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations();
  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition",
        "sm:flex-col sm:items-stretch sm:gap-2 sm:p-4",
        isSelected
          ? "border-primary-500 bg-primary-50/60"
          : "border-border hover:border-primary-300",
      )}
    >
      {/* Radyo görünmez ama DOM'da: klavye ve ekran okuyucu için tek seçim grubu. */}
      <Radio
        className="sr-only"
        name="shippingPackageTier"
        value={code}
        checked={isSelected}
        onChange={onSelect}
      />
      <span
        aria-hidden
        className={cn(
          "absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full transition",
          isSelected ? "bg-primary-600 text-inverted" : "hidden",
        )}
      >
        <CheckIcon className="h-3 w-3" />
      </span>

      <span className="relative h-14 w-20 shrink-0 sm:h-24 sm:w-full">
        <Image
          src={TIER_IMAGE[code]}
          alt=""
          fill
          sizes="(max-width: 640px) 80px, 240px"
          className="object-contain"
        />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-none">
        <span className="truncate text-sm font-semibold text-heading sm:text-center">
          {label}
        </span>
        <span className="block rounded-lg bg-primary-600 px-3 py-1.5 text-center">
          <span className="block text-[10px] font-medium uppercase tracking-wide text-inverted/80">
            {t("product.packageFeeLabel")}
          </span>
          <span className="block text-base font-bold text-inverted">
            {fmt(amount)}
          </span>
        </span>
        {dimensions && (
          <span className="block rounded-lg border border-dashed border-border px-2 py-1 text-center">
            <span className="block text-[10px] uppercase tracking-wide text-muted">
              {t("product.sampleDimensionsLabel")}
            </span>
            <span className="block text-xs font-medium text-body">
              {dimensions}
            </span>
          </span>
        )}
      </span>
    </label>
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
