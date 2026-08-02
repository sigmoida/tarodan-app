import { z } from "zod";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export type ShippingTariffStatus = "draft" | "active" | "archived";

/** Sabit üç paket boyutu; etiket ve aralıklar admin tarafından yönetilir. */
export const PACKAGE_TIER_CODES = ["small", "medium", "large"] as const;
export type PackageTierCode = (typeof PACKAGE_TIER_CODES)[number];

export interface ShippingPackageTier {
  id: string;
  code: PackageTierCode;
  label: string;
  minDesi: number;
  /** null = üst sınırsız (son boyut böyle olmalıdır). */
  maxDesi: number | null;
  amount: number | string;
  sampleWidth: number | null;
  sampleHeight: number | null;
  sampleLength: number | null;
  sortOrder: number;
}

export interface ShippingTariff {
  id: string;
  provider: string;
  name: string;
  status: ShippingTariffStatus;
  version: number;
  currency: string;
  outboundPackageFee: number | string;
  freeShippingEnabled: boolean;
  freeShippingThreshold: number | string;
  returnPackageFee: number | string;
  tradeLegFee: number | string;
  effectiveFrom: string;
  createdAt: string;
  packageTiers: ShippingPackageTier[];
}

/**
 * Varsayılan aralık iskeleti — API'deki SHIPPING_PACKAGE_TIER_DEFAULTS ile aynı.
 * Etiket katalogdan gelir; admin kaydettikten sonra kendi metnini kullanabilir.
 */
const TIER_DEFAULTS: Record<
  PackageTierCode,
  {
    labelKey: "tierSmallName" | "tierMediumName" | "tierLargeName";
    minDesi: string;
    maxDesi: string;
  }
> = {
  small: { labelKey: "tierSmallName", minDesi: "0", maxDesi: "2" },
  medium: { labelKey: "tierMediumName", minDesi: "2", maxDesi: "5" },
  large: { labelKey: "tierLargeName", minDesi: "5", maxDesi: "" },
};

const TIER_LABEL_KEY = {
  tierSmallName: "admin.shippingTariffs.tierSmallName",
  tierMediumName: "admin.shippingTariffs.tierMediumName",
  tierLargeName: "admin.shippingTariffs.tierLargeName",
} as const;

const optionalIntField = z
  .string()
  .optional()
  .default("")
  .refine(
    (value) =>
      value === "" || (Number.isInteger(Number(value)) && Number(value) >= 1),
    "",
  );

/** Form schema — validation only; strings are shaped to numbers in the mutationFn. */
export const tariffSchema = (t: T) =>
  z.object({
    name: z.string().min(1, t("admin.shippingTariffs.nameRequired")),
    freeShippingEnabled: z.boolean().default(true),
    freeShippingThreshold: z.string().optional().default("0"),
    returnPackageFee: z.string().optional().default("0"),
    tradeLegFee: z.string().optional().default("0"),
    packageTiers: z
      .array(
        z.object({
          code: z.enum(PACKAGE_TIER_CODES),
          label: z
            .string()
            .min(1, t("admin.shippingTariffs.tierLabelRequired")),
          minDesi: z
            .string()
            .refine(
              (value) => Number.isInteger(Number(value)) && Number(value) >= 0,
              t("admin.shippingTariffs.invalidDesi"),
            ),
          // Boş = üst sınırsız; yalnız son boyut böyle olabilir.
          maxDesi: z.string().optional().default(""),
          amount: z
            .string()
            .refine(
              (value) => Number.isFinite(Number(value)) && Number(value) >= 0,
              t("admin.shippingTariffs.invalidAmount"),
            ),
          sampleWidth: optionalIntField,
          sampleHeight: optionalIntField,
          sampleLength: optionalIntField,
        }),
      )
      .length(
        PACKAGE_TIER_CODES.length,
        t("admin.shippingTariffs.allTiersRequired"),
      )
      .superRefine((tiers, ctx) => {
        // Aktifleştirme guard'ının API tarafındaki kuralını burada da uygula:
        // 0'dan başla, boşluk/çakışma olmasın, son boyut üst sınırsız kalsın.
        // Böylece admin kaydettikten sonra aktifleştirmede sürprizle karşılaşmaz.
        tiers.forEach((tier, index) => {
          const isLast = index === tiers.length - 1;
          const min = Number(tier.minDesi);
          const max = tier.maxDesi === "" ? null : Number(tier.maxDesi);

          if (index === 0 && min !== 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, "minDesi"],
              message: t("admin.shippingTariffs.firstTierMustStartAtZero"),
            });
          }
          if (isLast && max !== null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, "maxDesi"],
              message: t("admin.shippingTariffs.lastTierMustBeUnbounded"),
            });
          }
          if (!isLast) {
            if (max === null || max <= min) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [index, "maxDesi"],
                message: t("admin.shippingTariffs.invalidTierRange"),
              });
            } else if (Number(tiers[index + 1].minDesi) !== max) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [index + 1, "minDesi"],
                message: t("admin.shippingTariffs.tierRangesMustBeContiguous"),
              });
            }
          }
        });
      }),
  });

export type TariffFormValues = z.infer<ReturnType<typeof tariffSchema>>;

const num = (v: number | string | undefined) => String(v ?? 0);
const optNum = (v: number | null | undefined) => (v == null ? "" : String(v));

export function tariffToForm(t: T, tariff?: ShippingTariff): TariffFormValues {
  const byCode = new Map(
    tariff?.packageTiers?.map((tier) => [tier.code, tier]),
  );
  return {
    name: tariff?.name ?? "",
    freeShippingEnabled: tariff?.freeShippingEnabled ?? true,
    freeShippingThreshold: num(tariff?.freeShippingThreshold),
    returnPackageFee: num(tariff?.returnPackageFee),
    tradeLegFee: num(tariff?.tradeLegFee),
    packageTiers: PACKAGE_TIER_CODES.map((code) => {
      const tier = byCode.get(code);
      const defaults = TIER_DEFAULTS[code];
      return {
        code,
        label: tier?.label ?? t(TIER_LABEL_KEY[defaults.labelKey]),
        minDesi: tier ? String(tier.minDesi) : defaults.minDesi,
        maxDesi: tier ? optNum(tier.maxDesi) : defaults.maxDesi,
        amount: num(tier?.amount),
        sampleWidth: optNum(tier?.sampleWidth),
        sampleHeight: optNum(tier?.sampleHeight),
        sampleLength: optNum(tier?.sampleLength),
      };
    }),
  };
}

const flt = (s: string) => parseFloat(s) || 0;
const optInt = (s: string) => (s === "" ? null : Number(s));

export function tariffFormToPayload(v: TariffFormValues) {
  const packageTiers = v.packageTiers.map((tier) => ({
    code: tier.code,
    label: tier.label.trim(),
    minDesi: Number(tier.minDesi),
    maxDesi: optInt(tier.maxDesi),
    amount: flt(tier.amount),
    sampleWidth: optInt(tier.sampleWidth),
    sampleHeight: optInt(tier.sampleHeight),
    sampleLength: optInt(tier.sampleLength),
  }));
  return {
    name: v.name.trim(),
    // Legacy alan: kademe fiyatları devraldı; en küçük boyutun tutarı taban kalır.
    outboundPackageFee: packageTiers[0]?.amount ?? 0,
    freeShippingEnabled: v.freeShippingEnabled,
    freeShippingThreshold: flt(v.freeShippingThreshold),
    returnPackageFee: flt(v.returnPackageFee),
    tradeLegFee: flt(v.tradeLegFee),
    packageTiers,
  };
}

/** i18n key per status — the page renders t(STATUS_KEY[status]). */
export const STATUS_KEY: Record<ShippingTariffStatus, string> = {
  draft: "admin.shippingTariffs.statusDraft",
  active: "admin.shippingTariffs.statusActive",
  archived: "admin.shippingTariffs.statusArchived",
};

export const STATUS_VARIANT: Record<
  ShippingTariffStatus,
  "success" | "warning" | "default"
> = {
  active: "success",
  draft: "warning",
  archived: "default",
};

/** "0–2 desi" / "5+ desi" — kademe aralığının okunabilir gösterimi (admin görür). */
export function tierRangeLabel(tier: {
  minDesi: number;
  maxDesi: number | null;
}): string {
  return tier.maxDesi == null
    ? `${tier.minDesi}+ desi`
    : `${tier.minDesi}–${tier.maxDesi} desi`;
}
