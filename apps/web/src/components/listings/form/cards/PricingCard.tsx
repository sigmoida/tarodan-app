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
import type { CommissionPreview, PackageTierShipping } from "../queries";

interface PricingCardProps {
  locale: string;
  commissionPreview: CommissionPreview | null;
  commissionPreviewLoading: boolean;
  commissionPreviewError?: unknown;
  /**
   * Önizleme istenebilir durumda mı (fiyat + kategori girildi mi). "Henüz
   * sormadık" ile "sunucu veremedi" ayrı durumlar; ikisine aynı mesajı
   * göstermek, fiyatını girmiş satıcıya "fiyat gir" demek olur.
   */
  commissionPreviewEnabled: boolean;
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
  commissionPreviewEnabled,
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

      <PackageSizePicker
        tierShipping={commissionPreview?.packageTierShipping ?? null}
        shippingLoading={commissionPreviewLoading}
        missingInputs={!commissionPreviewEnabled}
      />

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
 * Kargo girdisi: satıcı desi yazmaz, üç paket boyutundan birini seçer. Kartın
 * adı ve örnek ölçüsü aktif tarifeden, TUTARI komisyon önizlemesinden gelir;
 * desi arayüzde hiç görünmez. Seçim, altındaki hak ediş önizlemesini canlı
 * günceller.
 *
 * Kartta yazan tutar satıcının ÖDEYECEĞİ paydır, kargonun tam bedeli değil —
 * satıcının sorduğu soru "bu boyut bana kaça mal olur". Tam bedeli göstermek
 * hem alakasız hem yanıltıcıydı: pay kademe bazında yapılandırıldığı için üç
 * kademenin oranı farklı olabiliyor.
 *
 * Fiyat ya da kategori girilmeden tutar HESAPLANAMAZ (pay bu ikisiyle eşleşen
 * komisyon kuralından çıkar). O durumda kart tutarsız kalır ve neyin eksik
 * olduğunu söyleyen bir ipucu gösterilir — eski davranış burada tam bedeli
 * gösterip fiyat girilince başka bir sayıya atlıyordu.
 *
 * Kutu görseli kararın ASIL yardımcısı: satıcı "ürünüm bu koliye sığar mı"
 * sorusunu ölçü metninden önce gözüyle cevaplıyor. Bu yüzden görsel kartın
 * merkezinde, ücret ve örnek ölçü onun altında kendi bloklarında durur.
 */
function PackageSizePicker({
  tierShipping,
  shippingLoading,
  missingInputs,
}: {
  tierShipping: PackageTierShipping[] | null;
  shippingLoading: boolean;
  /** Fiyat/kategori henüz girilmedi — tutar hesaplanamaz, bu kullanıcının işi. */
  missingInputs: boolean;
}) {
  const t = useTranslations();
  const { setValue, watch } = useFormContext();
  const { tiers, tiersLoading } = usePackageTiers();
  const selected = watch("shippingPackageTier") as PackageTierCode;

  const amountByTier = new Map(
    (tierShipping ?? []).map((tier) => [tier.code, tier.sellerShippingAmount]),
  );

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
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {tiers.map((tier) => (
              <PackageSizeOption
                key={tier.code}
                label={tier.label}
                code={tier.code}
                amount={amountByTier.get(tier.code) ?? null}
                amountLoading={shippingLoading}
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
          {/* Yalnız EKSİK GİRDİ durumunda: sunucu hatasında (ör. aktif tarife
              yok → 503) ya da sürüm uyuşmazlığında bu mesaj görünürse, alanları
              doldurmuş satıcıya doldurmadığını söylemiş oluruz. Hata mesajını
              aşağıdaki özet kutusu veriyor. */}
          {missingInputs && (
            <p className="mt-2 text-xs text-muted">
              {t("product.packageFeeNeedsPriceAndCategory")}
            </p>
          )}
        </>
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
  amountLoading,
  dimensions,
  isSelected,
  onSelect,
}: {
  label: string;
  code: PackageTierCode;
  /** Satıcının ödeyeceği pay; fiyat/kategori girilmeden hesaplanamaz → null. */
  amount: number | null;
  amountLoading: boolean;
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
        {/* Tutar yokken şerit KAYBOLMAZ: kart yüksekliği sabit kalsın ve
            satıcı ücretin var olduğunu, yalnız henüz hesaplanmadığını görsün. */}
        <span
          className={cn(
            "block rounded-lg px-3 py-1.5 text-center",
            amount == null ? "bg-surface-alt" : "bg-primary-600",
          )}
        >
          <span
            className={cn(
              "block text-[10px] font-medium uppercase tracking-wide",
              amount == null ? "text-muted" : "text-inverted/80",
            )}
          >
            {t("product.packageFeeLabel")}
          </span>
          <span
            className={cn(
              "block text-base font-bold",
              amount == null ? "text-subtle" : "text-inverted",
            )}
          >
            {amountLoading ? "…" : amount == null ? "—" : fmt(amount)}
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
