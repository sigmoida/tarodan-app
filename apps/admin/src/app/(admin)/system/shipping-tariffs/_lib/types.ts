import { z } from "zod";
import { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

export type ShippingTariffStatus = "draft" | "active" | "archived";

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
  rates: Array<{
    id: string;
    desi: number;
    amount: number | string;
  }>;
}

/** Form schema — validation only; strings are shaped to numbers in the mutationFn. */
export const tariffSchema = (t: T) =>
  z.object({
    name: z.string().min(1, t("admin.shippingTariffs.nameRequired")),
    freeShippingEnabled: z.boolean().default(true),
    freeShippingThreshold: z.string().optional().default("0"),
    returnPackageFee: z.string().optional().default("0"),
    tradeLegFee: z.string().optional().default("0"),
    rates: z
      .array(
        z.object({
          desi: z
            .string()
            .refine(
              (value) =>
                Number.isInteger(Number(value)) &&
                Number(value) >= 1 &&
                Number(value) <= 20000,
              t("admin.shippingTariffs.invalidDesi"),
            ),
          amount: z
            .string()
            .refine(
              (value) => Number.isFinite(Number(value)) && Number(value) >= 0,
              t("admin.shippingTariffs.invalidAmount"),
            ),
        }),
      )
      .min(1, t("admin.shippingTariffs.rateRequired"))
      .superRefine((rates, ctx) => {
        const seen = new Set<number>();
        rates.forEach((rate, index) => {
          const desi = Number(rate.desi);
          if (seen.has(desi)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [index, "desi"],
              message: t("admin.shippingTariffs.duplicateDesi"),
            });
          }
          seen.add(desi);
        });
      }),
  });

export type TariffFormValues = z.infer<ReturnType<typeof tariffSchema>>;

const num = (v: number | string | undefined) => String(v ?? 0);

export function tariffToForm(t?: ShippingTariff): TariffFormValues {
  return {
    name: t?.name ?? "",
    freeShippingEnabled: t?.freeShippingEnabled ?? true,
    freeShippingThreshold: num(t?.freeShippingThreshold),
    returnPackageFee: num(t?.returnPackageFee),
    tradeLegFee: num(t?.tradeLegFee),
    rates: t?.rates?.length
      ? t.rates.map((rate) => ({
          desi: String(rate.desi),
          amount: num(rate.amount),
        }))
      : [{ desi: "1", amount: num(t?.outboundPackageFee) }],
  };
}

const flt = (s: string) => parseFloat(s) || 0;

export function tariffFormToPayload(v: TariffFormValues) {
  const rates = v.rates
    .map((rate) => ({
      desi: Number(rate.desi),
      amount: flt(rate.amount),
    }))
    .sort((a, b) => a.desi - b.desi);
  return {
    name: v.name.trim(),
    outboundPackageFee: rates[0]?.amount ?? 0,
    freeShippingEnabled: v.freeShippingEnabled,
    freeShippingThreshold: flt(v.freeShippingThreshold),
    returnPackageFee: flt(v.returnPackageFee),
    tradeLegFee: flt(v.tradeLegFee),
    rates,
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
