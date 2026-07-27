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
}

/** Form schema — validation only; strings are shaped to numbers in the mutationFn. */
export const tariffSchema = (t: T) =>
  z.object({
    name: z.string().min(1, t("admin.shippingTariffs.nameRequired")),
    outboundPackageFee: z.string().optional().default("0"),
    freeShippingEnabled: z.boolean().default(true),
    freeShippingThreshold: z.string().optional().default("0"),
    returnPackageFee: z.string().optional().default("0"),
    tradeLegFee: z.string().optional().default("0"),
  });

export type TariffFormValues = z.infer<ReturnType<typeof tariffSchema>>;

const num = (v: number | string | undefined) => String(v ?? 0);

export function tariffToForm(t?: ShippingTariff): TariffFormValues {
  return {
    name: t?.name ?? "",
    outboundPackageFee: num(t?.outboundPackageFee),
    freeShippingEnabled: t?.freeShippingEnabled ?? true,
    freeShippingThreshold: num(t?.freeShippingThreshold),
    returnPackageFee: num(t?.returnPackageFee),
    tradeLegFee: num(t?.tradeLegFee),
  };
}

const flt = (s: string) => parseFloat(s) || 0;

export function tariffFormToPayload(v: TariffFormValues) {
  return {
    name: v.name.trim(),
    outboundPackageFee: flt(v.outboundPackageFee),
    freeShippingEnabled: v.freeShippingEnabled,
    freeShippingThreshold: flt(v.freeShippingThreshold),
    returnPackageFee: flt(v.returnPackageFee),
    tradeLegFee: flt(v.tradeLegFee),
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
