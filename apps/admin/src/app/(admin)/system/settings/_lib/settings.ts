import { z } from "zod";
import { settingsToMap } from "@/lib/settings";

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

export const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: "listing", label: "İlan" },
  { key: "trade", label: "Takas" },
  { key: "message", label: "Mesaj" },
];

export const TAB_TITLE: Record<SettingsTab, string> = {
  listing: "İlan Ayarları",
  trade: "Takas Ayarları",
  message: "Mesaj Ayarları",
};

export const TAB_FIELDS: Record<SettingsTab, FieldDef[]> = {
  listing: [
    {
      key: "freeListingLimit",
      backendKey: "free_listing_limit",
      label: "Ücretsiz İlan Limiti",
      helper: "Ücretsiz üyelerin ilan limiti",
      min: 0,
    },
    {
      key: "basicListingLimit",
      backendKey: "basic_listing_limit",
      label: "Temel İlan Limiti",
      helper: "Temel üyelerin ilan limiti (-1 = sınırsız)",
      min: -1,
    },
    {
      key: "premiumListingLimit",
      backendKey: "premium_listing_limit",
      label: "Premium İlan Limiti",
      helper: "Premium üyelerin ilan limiti (-1 = sınırsız)",
      min: -1,
    },
    {
      key: "businessListingLimit",
      backendKey: "business_listing_limit",
      label: "Business İlan Limiti",
      helper: "Business üyelerin ilan limiti (-1 = sınırsız)",
      min: -1,
    },
    {
      key: "minProductPrice",
      backendKey: "min_product_price",
      label: "Minimum Ürün Fiyatı (₺)",
      helper: "Yeni ilanlar için minimum fiyat (mevcut ilanlar etkilenmez)",
      min: 0,
      step: 0.01,
    },
    {
      key: "maxProductPrice",
      backendKey: "max_product_price",
      label: "Maksimum Ürün Fiyatı (₺)",
      helper: "Yeni ilanlar için maksimum fiyat (mevcut ilanlar etkilenmez)",
      min: 0,
      step: 0.01,
    },
  ],
  trade: [
    {
      key: "tradeResponseHours",
      backendKey: "trade_response_deadline_hours",
      label: "Yanıt Süresi (Saat)",
      helper: "Takas teklifine yanıt süresi",
    },
    {
      key: "tradePaymentHours",
      backendKey: "trade_payment_deadline_hours",
      label: "Ödeme Süresi (Saat)",
      helper: "Kabul sonrası ödeme süresi (nakit takaslar için)",
    },
    {
      key: "tradeShippingDays",
      backendKey: "trade_shipping_deadline_days",
      label: "Kargo Süresi (Gün)",
      helper: "Kabul sonrası kargo gönderim süresi",
    },
    {
      key: "tradeConfirmationDays",
      backendKey: "trade_confirmation_deadline_days",
      label: "Onay Süresi (Gün)",
      helper: "Teslim sonrası onay süresi",
    },
  ],
  message: [
    {
      key: "maxMessageLength",
      backendKey: "max_message_length",
      label: "Maksimum Mesaj Uzunluğu",
      helper: "Bir mesajın maksimum karakter uzunluğu",
      min: 1,
    },
  ],
};

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
  for (const fields of Object.values(TAB_FIELDS)) {
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
const numField = (min?: number) =>
  z
    .string()
    .trim()
    .min(1, "Zorunlu")
    .refine(
      (v) => {
        const n = Number(v);
        return !Number.isNaN(n) && (min == null || n >= min);
      },
      min != null
        ? `Geçerli bir değer girin (en az ${min})`
        : "Geçerli bir değer girin",
    );

/** Zod schema for the whole settings form, derived from `TAB_FIELDS` (one source of truth). */
export const settingsSchema = z.object(
  Object.values(TAB_FIELDS)
    .flat()
    .reduce(
      (shape, f) => {
        shape[f.key] = numField(f.min);
        return shape;
      },
      {} as Record<keyof Settings, ReturnType<typeof numField>>,
    ),
);

export type SettingsFormValues = z.infer<typeof settingsSchema>;

/** Server `Settings` (numbers) → form values (strings) for `useZodForm`'s `values`. */
export function toFormValues(s: Settings): SettingsFormValues {
  return Object.fromEntries(
    (Object.keys(s) as (keyof Settings)[]).map((k) => [k, String(s[k])]),
  ) as SettingsFormValues;
}
