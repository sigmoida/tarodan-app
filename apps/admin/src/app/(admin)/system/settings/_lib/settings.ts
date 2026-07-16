import { z } from "zod";
import { useTranslations } from "next-intl";
import { settingsToMap } from "@/lib/settings";

type T = ReturnType<typeof useTranslations<never>>;

export interface Settings {
  freeListingLimit: number;
  basicListingLimit: number;
  premiumListingLimit: number;
  businessListingLimit: number;
  tradeResponseHours: number;
  tradePaymentHours: number;
  tradeShippingDays: number;
  tradeConfirmationDays: number;
  minProductPrice: number;
  maxProductPrice: number;
  maxMessageLength: number;
}

export type SettingsTab = "listing" | "trade" | "message";

export interface FieldDef {
  key: keyof Settings;
  /** platform_settings key used by the API. */
  backendKey: string;
  label: string;
  helper?: string;
  min?: number;
  step?: number;
}

type FieldMeta = Omit<FieldDef, "label" | "helper">;

/** Field metadata (no display text) — the source of truth for parsing + validation. */
const FIELD_DEFS: Record<SettingsTab, FieldMeta[]> = {
  listing: [
    { key: "freeListingLimit", backendKey: "free_listing_limit", min: 0 },
    { key: "basicListingLimit", backendKey: "basic_listing_limit", min: -1 },
    { key: "premiumListingLimit", backendKey: "premium_listing_limit", min: -1 },
    { key: "businessListingLimit", backendKey: "business_listing_limit", min: -1 },
    { key: "minProductPrice", backendKey: "min_product_price", min: 0, step: 0.01 },
    { key: "maxProductPrice", backendKey: "max_product_price", min: 0, step: 0.01 },
  ],
  trade: [
    { key: "tradeResponseHours", backendKey: "trade_response_deadline_hours" },
    { key: "tradePaymentHours", backendKey: "trade_payment_deadline_hours" },
    { key: "tradeShippingDays", backendKey: "trade_shipping_deadline_days" },
    { key: "tradeConfirmationDays", backendKey: "trade_confirmation_deadline_days" },
  ],
  message: [{ key: "maxMessageLength", backendKey: "max_message_length", min: 1 }],
};

/** Per-field translation keys (label/helper) — display-only, kept apart from `FIELD_DEFS`. */
// `as const` keeps the key literals narrow so next-intl's typed t() accepts them.
const FIELD_LABEL_KEYS = {
  freeListingLimit: {
    label: "admin.settings.fields.freeListingLimit.label",
    helper: "admin.settings.fields.freeListingLimit.helper",
  },
  basicListingLimit: {
    label: "admin.settings.fields.basicListingLimit.label",
    helper: "admin.settings.fields.basicListingLimit.helper",
  },
  premiumListingLimit: {
    label: "admin.settings.fields.premiumListingLimit.label",
    helper: "admin.settings.fields.premiumListingLimit.helper",
  },
  businessListingLimit: {
    label: "admin.settings.fields.businessListingLimit.label",
    helper: "admin.settings.fields.businessListingLimit.helper",
  },
  minProductPrice: {
    label: "admin.settings.fields.minProductPrice.label",
    helper: "admin.settings.fields.minProductPrice.helper",
  },
  maxProductPrice: {
    label: "admin.settings.fields.maxProductPrice.label",
    helper: "admin.settings.fields.maxProductPrice.helper",
  },
  tradeResponseHours: {
    label: "admin.settings.fields.tradeResponseHours.label",
    helper: "admin.settings.fields.tradeResponseHours.helper",
  },
  tradePaymentHours: {
    label: "admin.settings.fields.tradePaymentHours.label",
    helper: "admin.settings.fields.tradePaymentHours.helper",
  },
  tradeShippingDays: {
    label: "admin.settings.fields.tradeShippingDays.label",
    helper: "admin.settings.fields.tradeShippingDays.helper",
  },
  tradeConfirmationDays: {
    label: "admin.settings.fields.tradeConfirmationDays.label",
    helper: "admin.settings.fields.tradeConfirmationDays.helper",
  },
  maxMessageLength: {
    label: "admin.settings.fields.maxMessageLength.label",
    helper: "admin.settings.fields.maxMessageLength.helper",
  },
} as const satisfies Record<keyof Settings, { label: string; helper: string }>;

export function settingsTabs(t: T): { key: SettingsTab; label: string }[] {
  return [
    { key: "listing", label: t("admin.settings.tabs.listing") },
    { key: "trade", label: t("admin.settings.tabs.trade") },
    { key: "message", label: t("admin.settings.tabs.message") },
  ];
}

export function tabTitle(t: T): Record<SettingsTab, string> {
  return {
    listing: t("admin.settings.tabTitle.listing"),
    trade: t("admin.settings.tabTitle.trade"),
    message: t("admin.settings.tabTitle.message"),
  };
}

/** Field defs with translated label/helper attached, for rendering the form. */
export function tabFields(t: T): Record<SettingsTab, FieldDef[]> {
  const withLabels = (fields: FieldMeta[]): FieldDef[] =>
    fields.map((f) => ({
      ...f,
      label: t(FIELD_LABEL_KEYS[f.key].label),
      helper: t(FIELD_LABEL_KEYS[f.key].helper),
    }));
  return {
    listing: withLabels(FIELD_DEFS.listing),
    trade: withLabels(FIELD_DEFS.trade),
    message: withLabels(FIELD_DEFS.message),
  };
}

const DEFAULTS: Settings = {
  freeListingLimit: 10,
  basicListingLimit: 50,
  premiumListingLimit: -1,
  businessListingLimit: -1,
  tradeResponseHours: 72,
  tradePaymentHours: 48,
  tradeShippingDays: 7,
  tradeConfirmationDays: 3,
  minProductPrice: 10,
  maxProductPrice: 100000,
  maxMessageLength: 1000,
};

/** Normalize the API response (array of key/value rows OR plain object) into Settings. */
export function parseSettings(raw: unknown): Settings {
  const obj = settingsToMap(raw);

  const result = { ...DEFAULTS };
  for (const fields of Object.values(FIELD_DEFS)) {
    for (const f of fields) {
      const v = obj[f.backendKey];
      if (v != null && v !== "") result[f.key] = Number(v);
    }
  }
  return result;
}

/**
 * A single numeric setting: kept as a string (native number input yields
 * strings) and validated for "is a number ≥ min". Payload shaping to a number
 * stays in the mutationFn (CLAUDE.md §11).
 */
const numField = (t: T, min?: number) =>
  z
    .string()
    .trim()
    .min(1, t("admin.settings.validation.required"))
    .refine(
      (v) => {
        const n = Number(v);
        return !Number.isNaN(n) && (min == null || n >= min);
      },
      min != null
        ? t("admin.settings.validation.invalidValueMin", { min })
        : t("admin.settings.validation.invalidValue"),
    );

/** Zod schema for the whole settings form, derived from `FIELD_DEFS` (one source of truth). */
export const settingsSchema = (t: T) =>
  z.object(
    Object.values(FIELD_DEFS)
      .flat()
      .reduce(
        (shape, f) => {
          shape[f.key] = numField(t, f.min);
          return shape;
        },
        {} as Record<keyof Settings, ReturnType<typeof numField>>,
      ),
  );

export type SettingsFormValues = z.infer<ReturnType<typeof settingsSchema>>;

/** Server `Settings` (numbers) → form values (strings) for `useZodForm`'s `values`. */
export function toFormValues(s: Settings): SettingsFormValues {
  return Object.fromEntries(
    (Object.keys(s) as (keyof Settings)[]).map((k) => [k, String(s[k])]),
  ) as SettingsFormValues;
}
