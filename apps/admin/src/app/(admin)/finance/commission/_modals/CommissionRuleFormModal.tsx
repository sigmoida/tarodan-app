"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { Input, Select, Tooltip, TooltipProvider } from "@tarodan/ui";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import {
  FormModal,
  FormError,
  FormInput,
  FormSelect,
  FormCheckbox,
  useZodForm,
} from "@tarodan/ui/form";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { extractList } from "@/lib/extract";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { useCategories } from "@/hooks/useCategories";
import { usePspFeeRate } from "@/hooks/usePspFeeRate";
import { extractErrorMessage } from "@/lib/error";
import { fmtTry } from "@/lib/format";
import {
  buildOrderBreakdown,
  type OrderBreakdownLineKey,
} from "@tarodan/shared";
import {
  ALL_CATEGORIES,
  type CommissionRule,
  type CommissionFormValues,
  commissionSchema,
  emptyCommissionForm,
  ruleToForm,
  commissionFormToPayload,
  sellerTypes,
  taxpayerTypes,
  appliesToOptions,
  type PackageTierCode,
} from "../_lib/types";

interface ShippingTariffSummary {
  id: string;
  name: string;
  provider: string;
  version: number;
  status: "draft" | "active" | "archived";
  outboundPackageFee: number | string;
  packageTiers?: Array<{
    code: PackageTierCode;
    label: string;
    minDesi: number;
    maxDesi: number | null;
    amount: number | string;
  }>;
}

/** rate% of amount, clamped by optional [min,max] TL. */
function feeFor(
  amount: number,
  rate: string,
  min: string,
  max: string,
): number {
  const r = parseFloat(rate);
  if (!r || Number.isNaN(r)) return 0;
  let val = amount * (r / 100);
  const lo = parseFloat(min);
  const hi = parseFloat(max);
  if (!Number.isNaN(lo) && val < lo) val = lo;
  if (!Number.isNaN(hi) && val > hi) val = hi;
  return Math.round(val * 100) / 100;
}

/** Reusable rate + TL floor/cap block. */
function RateBlock({
  title,
  rateName,
  minName,
  maxName,
}: {
  title: string;
  rateName: string;
  minName: string;
  maxName: string;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-heading">
        {title}
        <HintIcon text={t("admin.finance.commission.feeBoundsHint")} />
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <FormInput
          name={rateName}
          label={t("admin.finance.commission.ratePercent")}
          type="number"
          step="0.01"
          min="0"
          placeholder={t("admin.finance.commission.ratePlaceholder")}
        />
        <FormInput
          name={minName}
          label={t("admin.finance.commission.minTl")}
          type="number"
          step="0.01"
          min="0"
          placeholder={t("admin.finance.commission.noFloor")}
        />
        <FormInput
          name={maxName}
          label={t("admin.finance.commission.maxTl")}
          type="number"
          step="0.01"
          min="0"
          placeholder={t("admin.finance.commission.noCap")}
        />
      </div>
    </div>
  );
}

/** Başlık yanına konan kısa açıklama — alan başına tekrar etmemesi için grup düzeyinde. */
function HintIcon({ text }: { text: string }) {
  return (
    <Tooltip content={<span className="block max-w-xs">{text}</span>}>
      <span className="inline-flex cursor-help align-middle text-subtle">
        <InformationCircleIcon className="h-4 w-4" aria-label={text} />
      </span>
    </Tooltip>
  );
}

const clampSharePct = (v: number) => Math.min(100, Math.max(0, v));

/** Alıcı/satıcı bölüşümünü tek bakışta gösteren mini bar. */
function ShareBar({ buyer, dimmed }: { buyer: number; dimmed?: boolean }) {
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-alt ${
        dimmed ? "opacity-50" : ""
      }`}
    >
      <div
        className="h-full rounded-full bg-primary-500"
        style={{ width: `${buyer}%` }}
      />
    </div>
  );
}

/**
 * Tek satırlık pay girişi: etiket + alıcı % input'u + CANLI "Alıcı %X · Satıcı %Y"
 * bölüşümü. Bir tarafı girince diğeri ekranda görünür — "kalan kim ödüyor"
 * sorusu kafada hesaplanmaz.
 */
function ShareRow({
  label,
  name,
  buyer,
  usesDefault,
  placeholder,
}: {
  label: string;
  name: string;
  buyer: number;
  usesDefault?: boolean;
  placeholder: string;
}) {
  const t = useTranslations();
  const pct = (n: number) => Math.round(n * 100) / 100;
  return (
    <div className="grid grid-cols-[minmax(8rem,11rem)_5.5rem_1fr] items-center gap-3">
      <span className="truncate text-sm text-body">{label}</span>
      <FormInput
        name={name}
        type="number"
        step="1"
        min="0"
        max="100"
        placeholder={placeholder}
        aria-label={label}
      />
      <div className="min-w-0">
        <div className="mb-1 flex justify-between gap-2 text-xs">
          <span className={usesDefault ? "text-subtle" : "text-body"}>
            {t("admin.finance.common.buyer")} %{pct(buyer)}
            {usesDefault && (
              <span className="text-subtle">
                {" "}
                ({t("admin.finance.commission.usesDefaultShare")})
              </span>
            )}
          </span>
          <span className={usesDefault ? "text-subtle" : "text-body"}>
            {t("admin.finance.common.seller")} %{pct(100 - buyer)}
          </span>
        </div>
        <ShareBar buyer={buyer} dimmed={usesDefault} />
      </div>
    </div>
  );
}

/**
 * Kargo bölüşümü: önce VARSAYILAN pay (tüm boyutlar), altında boyut bazlı
 * İSTİSNALAR. Her satırda alıcı VE satıcı yüzdesi canlı görünür.
 */
function ShippingSplitSection() {
  const t = useTranslations();
  const { watch } = useFormContext<CommissionFormValues>();
  const v = watch();
  const defaultShare = clampSharePct(parseFloat(v.shippingBuyerShare) || 0);
  const hasDefault = v.shippingBuyerShare.trim() !== "";
  const effectiveDefault = hasDefault ? defaultShare : 100;

  const tiers: Array<{ name: keyof CommissionFormValues; label: string }> = [
    {
      name: "shippingShareSmall",
      label: t("admin.finance.commission.tierSmall"),
    },
    {
      name: "shippingShareMedium",
      label: t("admin.finance.commission.tierMedium"),
    },
    {
      name: "shippingShareLarge",
      label: t("admin.finance.commission.tierLarge"),
    },
  ];

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-medium text-heading">
          {t("admin.finance.commission.shippingSharesTitle")}
        </h3>
        <p className="text-xs text-muted">
          {t("admin.finance.commission.shippingSharesHelper")}
        </p>
      </div>

      <ShareRow
        label={t("admin.finance.commission.defaultShareLabel")}
        name="shippingBuyerShare"
        buyer={effectiveDefault}
        usesDefault={!hasDefault}
        placeholder="100"
      />

      <div className="border-t border-border pt-3">
        <p className="mb-2 text-xs font-medium text-muted">
          {t("admin.finance.commission.tierOverridesTitle")} —{" "}
          {t("admin.finance.commission.tierOverridesHint")}
        </p>
        <div className="space-y-2">
          {tiers.map((tier) => {
            const raw = String(v[tier.name] ?? "");
            const overridden = raw.trim() !== "";
            const buyer = overridden
              ? clampSharePct(parseFloat(raw) || 0)
              : effectiveDefault;
            return (
              <ShareRow
                key={tier.name}
                label={tier.label}
                name={tier.name}
                buyer={buyer}
                usesDefault={!overridden}
                placeholder={String(effectiveDefault)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Live client-side breakdown for an example order — commission + shipping split + VAT/stopaj. */
/**
 * Primitifin kalem anahtarı → çeviri anahtarı. Değerler TAM literal: next-intl
 * anahtarları tip düzeyinde doğruluyor, şablon literali (`...${key}`) kabul
 * edilmiyor.
 */
const LINE_LABEL = {
  buyerCommission: "admin.finance.commission.buyerCommission",
  buyerShipping: "admin.finance.commission.buyerShipping",
  buyerServiceFee: "admin.finance.commission.buyerServiceFee",
  sellerCommission: "admin.finance.commission.sellerCommission",
  sellerShipping: "admin.finance.commission.sellerShipping",
  sellerPlatformFee: "admin.finance.commission.sellerPlatformFee",
} as const satisfies Record<OrderBreakdownLineKey, string>;

function BreakdownPreview() {
  const t = useTranslations();
  const { watch } = useFormContext<CommissionFormValues>();
  const v = watch();
  // PSP oranı ayardan gelir (KDV/stopaj gibi elle denenmez): şelalenin PayTR
  // satırı, sipariş dosyasındakiyle aynı orandan hesaplansın.
  const pspFeeRate = usePspFeeRate();
  const [price, setPrice] = useState("1000");
  const [tierCode, setTierCode] = useState<PackageTierCode>("small");
  const [vat, setVat] = useState("20");
  const [withholding, setWithholding] = useState("1");
  const tariffsQuery = useQuery({
    queryKey: adminKeys.all("shipping-tariffs"),
    queryFn: async () =>
      extractList<ShippingTariffSummary>(
        (await adminApi.getShippingTariffs()).data,
      ),
  });
  const activeTariff = tariffsQuery.data?.find(
    (tariff) => tariff.status === "active",
  );
  const tiers = activeTariff?.packageTiers ?? [];
  const selectedTier = tiers.find((tier) => tier.code === tierCode) ?? tiers[0];

  const amount = parseFloat(price) || 0;
  const shipping = selectedTier
    ? Number(selectedTier.amount)
    : Number(activeTariff?.outboundPackageFee ?? 0);
  const vatRate = parseFloat(vat) || 0;
  const whRate = parseFloat(withholding) || 0;

  const buyerCommission = feeFor(
    amount,
    v.buyerCommissionRate,
    v.buyerCommissionMin,
    v.buyerCommissionMax,
  );
  const buyerServiceFee = feeFor(
    amount,
    v.buyerServiceFeeRate,
    v.buyerServiceFeeMin,
    v.buyerServiceFeeMax,
  );
  const sellerCommission = feeFor(
    amount,
    v.sellerCommissionRate,
    v.sellerCommissionMin,
    v.sellerCommissionMax,
  );
  const sellerPlatformFee = feeFor(
    amount,
    v.sellerPlatformFeeRate,
    v.sellerPlatformFeeMin,
    v.sellerPlatformFeeMax,
  );
  // Seçilen boyutun payı; o boyut boş bırakıldıysa kuralın tek payı geçerli.
  const tierShareValue = {
    small: v.shippingShareSmall,
    medium: v.shippingShareMedium,
    large: v.shippingShareLarge,
  }[selectedTier?.code ?? "small"];
  const buyerShare = Math.min(
    100,
    Math.max(0, parseFloat(tierShareValue || v.shippingBuyerShare) || 0),
  );
  const buyerShipping = Math.round(shipping * (buyerShare / 100) * 100) / 100;
  const sellerShipping = Math.round((shipping - buyerShipping) * 100) / 100;
  // Stopaj yalnız kurumsal satıcıda doğar; ürün KDV'si tahsil EDİLMEZ (vitrin
  // fiyatı KDV dahil kabul edilir), bu yüzden alıcı toplamına eklenmez.
  const isCorporate = v.taxpayerType === "corporate";
  const stopaj = isCorporate
    ? Math.round(amount * (whRate / 100) * 100) / 100
    : 0;

  // Hesabın tamamı ORTAK primitiften gelir: bu ekran kendi formülünü yazarsa
  // önizleme ile gerçek tahsilat sessizce ayrışır.
  const breakdown = buildOrderBreakdown({
    subtotal: amount,
    sellerCommissionAmount: sellerCommission,
    sellerPlatformFeeAmount: sellerPlatformFee,
    sellerShippingAmount: sellerShipping,
    buyerCommissionAmount: buyerCommission,
    buyerServiceFeeAmount: buyerServiceFee,
    buyerShippingAmount: buyerShipping,
    withholdingTaxAmount: stopaj,
    serviceVatRate: vatRate,
    pspFeeRate,
  });

  /**
   * Kalem satırı: tutar + o kalemin KDV'si. Tutar 0 olsa bile satır GİZLENMEZ —
   * satıcı, kuralın o kalemi hiç almadığını ancak sıfır görerek anlayabilir.
   */
  const Row = ({
    label,
    value,
    vat,
    tone,
  }: {
    label: string;
    value: number;
    vat?: number;
    tone?: string;
  }) => (
    <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4">
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${tone ?? "text-heading"}`}>
        {fmtTry(value)}
      </span>
      <span className="w-20 text-right text-xs tabular-nums text-muted">
        {vat == null ? "" : fmtTry(vat)}
      </span>
    </div>
  );

  /** Ara/son toplam satırı — KDV sütunu boş kalır. */
  const TotalRow = ({
    label,
    value,
    tone,
    strong,
  }: {
    label: string;
    value: number;
    tone?: string;
    strong?: boolean;
  }) => (
    <div
      className={`grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 border-t border-border pt-1.5 ${
        strong ? "font-semibold" : ""
      }`}
    >
      <span>{label}</span>
      <span className={`tabular-nums ${tone ?? "text-heading"}`}>
        {fmtTry(value)}
      </span>
      <span className="w-20" />
    </div>
  );

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-medium text-muted">
        {t("admin.finance.commission.previewCalculator")}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          type="number"
          min="0"
          step="0.01"
          label={t("admin.finance.commission.examplePrice")}
          value={price}
          placeholder="1000"
          onChange={(e) => setPrice(e.target.value)}
        />
        <Select
          label={t("admin.finance.commission.examplePackageTier")}
          value={selectedTier?.code ?? ""}
          onChange={(event) =>
            setTierCode(event.target.value as PackageTierCode)
          }
          disabled={tariffsQuery.isLoading || tiers.length === 0}
          options={tiers.map((tier) => ({
            value: tier.code,
            label: `${tier.label} — ${fmtTry(Number(tier.amount))}`,
          }))}
          placeholder={t("admin.finance.commission.noActiveShippingTariff")}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          label={t("admin.finance.commission.exampleVat")}
          value={vat}
          placeholder="20"
          onChange={(e) => setVat(e.target.value)}
        />
        <Input
          type="number"
          min="0"
          step="0.01"
          label={t("admin.finance.commission.exampleWithholding")}
          value={withholding}
          placeholder="1"
          onChange={(e) => setWithholding(e.target.value)}
        />
      </div>
      {activeTariff && (
        <p className="text-xs text-muted">
          {t("admin.finance.commission.activeShippingTariff", {
            name: activeTariff.name,
            version: activeTariff.version,
            amount: fmtTry(shipping),
          })}
        </p>
      )}
      {!isCorporate && (
        <p className="text-xs text-muted">
          {t("admin.finance.commission.corporateOnlyNote")}
        </p>
      )}
      <div className="space-y-1.5 rounded-lg bg-surface-alt p-4 text-sm">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs uppercase tracking-wide text-muted">
          <span>{t("admin.finance.commission.buyerSide")}</span>
          <span className="text-right">
            {t("admin.finance.commission.lineAmount")}
          </span>
          <span className="w-20 text-right">
            {t("admin.finance.commission.lineVat")}
          </span>
        </div>
        <Row
          label={t("admin.finance.commission.productPrice")}
          value={breakdown.subtotal}
        />
        {breakdown.buyer.lines.map((line) => (
          <Row
            key={line.key}
            label={t(LINE_LABEL[line.key])}
            value={line.amount}
            vat={line.vat}
          />
        ))}
        <TotalRow
          label={t("admin.finance.commission.buyerVatTotal")}
          value={breakdown.buyer.vatTotal}
        />
        <TotalRow
          label={t("admin.finance.commission.buyerAddedTotal")}
          value={breakdown.buyer.addedTotal}
        />
        <TotalRow
          label={t("admin.finance.commission.buyerPays")}
          value={breakdown.buyer.payable}
          tone="text-primary-700"
          strong
        />

        <div className="pt-3" />
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs uppercase tracking-wide text-muted">
          <span>{t("admin.finance.commission.sellerSide")}</span>
          <span className="text-right">
            {t("admin.finance.commission.lineAmount")}
          </span>
          <span className="w-20 text-right">
            {t("admin.finance.commission.lineVat")}
          </span>
        </div>
        {breakdown.seller.lines.map((line) => (
          <Row
            key={line.key}
            label={t(LINE_LABEL[line.key])}
            value={line.amount}
            vat={line.vat}
          />
        ))}
        <TotalRow
          label={t("admin.finance.commission.sellerVatTotal")}
          value={breakdown.seller.vatTotal}
        />
        {/* Stopaj bir KDV değil; bireysel satıcıda 0 olarak durur. */}
        <Row
          label={t("admin.finance.commission.withholding")}
          value={breakdown.seller.withholding}
        />
        <TotalRow
          label={t("admin.finance.commission.sellerDeductionTotal")}
          value={breakdown.seller.deductionTotal}
        />
        <TotalRow
          label={t("admin.finance.commission.sellerReceives")}
          value={breakdown.seller.net}
          tone="text-success-700"
          strong
        />

        <div className="pt-3" />
        <div className="text-xs uppercase tracking-wide text-muted">
          {t("admin.finance.commission.platformSplitTitle")}
        </div>
        {/* Şelale: elde kalan brütten maliyetler sırayla düşülür → net hak ediş. */}
        <Row
          label={t("admin.finance.commission.grossRetained")}
          value={breakdown.platform.grossRetained}
          tone="text-heading font-medium"
        />
        <Row
          label={t("admin.finance.commission.platformShipping")}
          value={-breakdown.platform.shipping}
        />
        <Row
          label={t("admin.finance.commission.afterShipping")}
          value={breakdown.platform.afterShipping}
        />
        <Row
          label={t("admin.finance.commission.withholding")}
          value={-breakdown.seller.withholding}
        />
        <Row
          label={t("admin.finance.commission.afterWithholding")}
          value={breakdown.platform.afterWithholding}
        />
        <Row
          label={t("admin.finance.commission.serviceVatOut")}
          value={-breakdown.platform.vatOut}
        />
        <Row
          label={t("admin.finance.commission.afterVat")}
          value={breakdown.platform.afterVat}
        />
        <Row
          label={t("admin.finance.commission.pspFee")}
          value={-breakdown.platform.pspFee}
        />
        <TotalRow
          label={t("admin.finance.commission.netRevenue")}
          value={breakdown.platform.netRevenue}
          tone="text-primary-700"
          strong
        />
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs text-muted">
          <span>{t("admin.finance.commission.netTakeRate")}</span>
          <span className="tabular-nums">
            %{breakdown.platform.netTakeRate}
          </span>
          <span className="w-20" />
        </div>
      </div>
      <p className="text-xs text-muted">
        {t("admin.finance.commission.emptyLineNote")}
      </p>
      <p className="text-xs text-muted">
        {t("admin.finance.commission.previewTaxNote")}
      </p>
      <p className="text-xs text-muted">
        {t("admin.finance.commission.pspRateNote")}
      </p>
    </div>
  );
}

/** Create/edit commission rule. Mount with `key={rule?.id ?? 'new'}` so defaults seed fresh. */
export function CommissionRuleFormModal({
  open,
  onClose,
  rule,
}: {
  open: boolean;
  onClose: () => void;
  rule?: CommissionRule;
}) {
  const t = useTranslations();
  const isEdit = Boolean(rule);
  const form = useZodForm(commissionSchema(t), {
    defaultValues: rule ? ruleToForm(rule) : emptyCommissionForm,
  });

  const { data: categories = [] } = useCategories();

  const save = useAdminMutation(
    (v: CommissionFormValues) =>
      isEdit
        ? adminApi.updateCommissionRule(rule!.id, commissionFormToPayload(v))
        : adminApi.createCommissionRule(commissionFormToPayload(v)),
    {
      invalidates: ["commission-rules"],
      successMessage: isEdit
        ? t("admin.finance.commission.ruleUpdated")
        : t("admin.finance.commission.ruleCreated"),
      // Toast AÇIK: form uzun ve kaydet düğmesi en altta; inline <FormError />
      // formun tepesinde render edildiği için 400'ün gerekçesi (ör. çakışan
      // kural) ekran dışında kalıyor ve kullanıcı hiçbir uyarı görmüyordu.
      // Toast + inline hata birlikte durur; ikisi de aynı sunucu mesajını yazar.
      errorMessage: t("admin.finance.commission.saveFailed"),
      onSuccess: onClose,
    },
  );

  // Kategoriler asenkron yüklenir. Düzenlenen kuralın kategorisi liste gelene
  // kadar seçenekler arasında bulunmuyor ve seçim BOŞ görünüyordu; yükleme
  // bitene kadar kuralın kendi kategorisi geçici bir seçenek olarak eklenir.
  const selectedCategoryId = form.watch("categoryId");
  const knownCategory =
    selectedCategoryId === ALL_CATEGORIES ||
    categories.some((c) => c.id === selectedCategoryId);
  const categoryOptions = [
    {
      value: ALL_CATEGORIES,
      label: t("admin.finance.commission.allCategories"),
    },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
    ...(knownCategory
      ? []
      : [{ value: selectedCategoryId, label: t("common.loading") }]),
  ];

  const submit = (values: CommissionFormValues) => {
    form.clearErrors("root");
    save.mutate(values, {
      onError: (error) => {
        form.setError("root", {
          type: "server",
          message: extractErrorMessage(
            error,
            t("admin.finance.commission.saveFailed"),
          ),
        });
      },
    });
  };

  return (
    <TooltipProvider>
      <FormModal
        open={open}
        onClose={onClose}
        title={
          isEdit
            ? t("admin.finance.commission.editRule")
            : t("admin.finance.commission.newRule")
        }
        form={form}
        onSubmit={submit}
        isSubmitting={save.isPending}
        submitLabel={isEdit ? t("common.update") : t("common.create")}
        size="2xl"
      >
        <FormError />
        <FormInput
          name="name"
          label={t("admin.finance.commission.ruleName")}
          placeholder={t("admin.finance.commission.ruleNamePlaceholder")}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormSelect
            name="categoryId"
            label={t("common.category")}
            options={categoryOptions}
          />
          <FormSelect
            name="sellerType"
            label={t("admin.finance.commission.sellerType")}
            options={sellerTypes(t)}
          />
          <FormSelect
            name="taxpayerType"
            label={t("admin.finance.commission.taxpayerType")}
            options={taxpayerTypes(t)}
          />
        </div>

        {/* Kademeli eşleşme: ürün/satır tutar aralığı */}
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-heading">
            {t("admin.finance.commission.amountRangeTitle")}
            <HintIcon text={t("admin.finance.commission.amountRangeHint")} />
          </h3>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormInput
            name="minAmount"
            label={t("admin.finance.commission.minAmountLabel")}
            type="number"
            step="0.01"
            min="0"
            placeholder={t("admin.finance.commission.noLowerBound")}
          />
          <FormInput
            name="maxAmount"
            label={t("admin.finance.commission.maxAmountLabel")}
            type="number"
            step="0.01"
            min="0"
            placeholder={t("admin.finance.commission.noUpperBound")}
          />
          <FormSelect
            name="appliesTo"
            label={t("admin.finance.commission.appliesTo")}
            options={appliesToOptions(t)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RateBlock
            title={t("admin.finance.commission.sellerCommission")}
            rateName="sellerCommissionRate"
            minName="sellerCommissionMin"
            maxName="sellerCommissionMax"
          />
          <RateBlock
            title={t("admin.finance.commission.sellerPlatformFee")}
            rateName="sellerPlatformFeeRate"
            minName="sellerPlatformFeeMin"
            maxName="sellerPlatformFeeMax"
          />
          <RateBlock
            title={t("admin.finance.commission.buyerServiceFee")}
            rateName="buyerServiceFeeRate"
            minName="buyerServiceFeeMin"
            maxName="buyerServiceFeeMax"
          />
          <RateBlock
            title={t("admin.finance.commission.buyerCommission")}
            rateName="buyerCommissionRate"
            minName="buyerCommissionMin"
            maxName="buyerCommissionMax"
          />
        </div>

        <ShippingSplitSection />

        {/* TAKAS sabit bedelleri: oran DEĞİL, KDV DAHİL tutar. Takasta taraflar
            alıcı/satıcı hesabı değildir; ürünü veren "satıcı", alan "alıcı"
            ücretini öder ve iki taraf da kendi toplamını öder. */}
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div>
            <h3 className="text-sm font-medium text-heading">
              {t("admin.finance.commission.tradeFeesTitle")}
            </h3>
            <p className="text-xs text-muted">
              {t("admin.finance.commission.tradeFeesHelper")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              name="tradeFeeSellerAmount"
              label={t("admin.finance.commission.tradeFeeSeller")}
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
            />
            <FormInput
              name="tradeFeeBuyerAmount"
              label={t("admin.finance.commission.tradeFeeBuyer")}
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
            />
          </div>
        </div>

        <BreakdownPreview />
        <FormCheckbox
          name="isActive"
          label={t("admin.finance.commission.ruleActive")}
        />
      </FormModal>
    </TooltipProvider>
  );
}
