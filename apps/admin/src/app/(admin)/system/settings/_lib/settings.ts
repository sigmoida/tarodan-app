import { z } from "zod";
import { useTranslations } from "next-intl";
import { DEFAULT_PSP_FEE_RATE, settingsToMap } from "@/lib/settings";

type T = ReturnType<typeof useTranslations<never>>;

export interface Settings {
  minProductPrice: number;
  maxProductPrice: number;
  maxMessageLength: number;
  /** PSP (PayTR) kesinti oranı (%) — hak ediş ekranlarındaki tahmini maliyet. */
  pspFeeRate: number;
  /** Admin panelinde boşta kalma süresi (dk) — oturumu bitiren gerçek sayaç. */
  adminSessionTimeoutMinutes: number;
}

/**
 * Takas süreleri burada YOK: her iş süresi Sistem → Süreler ve Kurallar
 * ekranında (`/system/timing-rules`) tek yerden yönetilir.
 */
export type SettingsTab = "listing" | "message" | "finance" | "security";
/**
 * All page tabs — "warehouse" and "legal" render their own cards, not the
 * numeric form.
 */
export type SettingsPageTab = SettingsTab | "warehouse" | "legal";

/** Numeric-form tabs — an unknown `?tab=` (e.g. the retired "trade") falls back. */
export function isSettingsTab(value: string): value is SettingsTab {
  return (
    value === "listing" ||
    value === "message" ||
    value === "finance" ||
    value === "security"
  );
}

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
  // İlan LİMİTLERİ burada YOK: üyelikle belirlenen her özellik yalnız Üyelik
  // Katmanları ekranından yönetilir (tek kaynak MembershipTier). Buradaki
  // `*_listing_limit` ayarları katman limitlerini eziyordu ve form, olmayan
  // ayar için uydurma varsayılan gösterdiğinden tek bir kaydetme premium/
  // business katmanlarını sessizce sınırsız yapıyordu.
  listing: [
    {
      key: "minProductPrice",
      backendKey: "min_product_price",
      min: 0,
      step: 0.01,
    },
    {
      key: "maxProductPrice",
      backendKey: "max_product_price",
      min: 0,
      step: 0.01,
    },
  ],
  message: [
    { key: "maxMessageLength", backendKey: "max_message_length", min: 1 },
  ],
  // Oran koda gömülmez: PayTR sözleşmesi değiştiğinde deploy gerekmesin diye
  // ayardan okunur. Yalnız GÖSTERİM içindir — tahsilat akışında kullanılmaz.
  finance: [
    { key: "pspFeeRate", backendKey: "psp_fee_rate", min: 0, step: 0.01 },
  ],
  // min 5: daha kısa bir değer, yöneticiyi ayarı düzeltmeye fırsat bulamadan
  // dışarı atardı (kendini kilitleme). Backend de <5'i varsayılana düşürür.
  security: [
    {
      key: "adminSessionTimeoutMinutes",
      backendKey: "admin_session_timeout_minutes",
      min: 5,
    },
  ],
};

/** Per-field translation keys (label/helper) — display-only, kept apart from `FIELD_DEFS`. */
// `as const` keeps the key literals narrow so next-intl's typed t() accepts them.
const FIELD_LABEL_KEYS = {
  minProductPrice: {
    label: "admin.settings.fields.minProductPrice.label",
    helper: "admin.settings.fields.minProductPrice.helper",
  },
  maxProductPrice: {
    label: "admin.settings.fields.maxProductPrice.label",
    helper: "admin.settings.fields.maxProductPrice.helper",
  },
  maxMessageLength: {
    label: "admin.settings.fields.maxMessageLength.label",
    helper: "admin.settings.fields.maxMessageLength.helper",
  },
  pspFeeRate: {
    label: "admin.settings.fields.pspFeeRate.label",
    helper: "admin.settings.fields.pspFeeRate.helper",
  },
  adminSessionTimeoutMinutes: {
    label: "admin.settings.fields.adminSessionTimeoutMinutes.label",
    helper: "admin.settings.fields.adminSessionTimeoutMinutes.helper",
  },
} as const satisfies Record<keyof Settings, { label: string; helper: string }>;

export function settingsTabs(t: T): { key: SettingsPageTab; label: string }[] {
  return [
    { key: "listing", label: t("admin.settings.tabs.listing") },
    { key: "message", label: t("admin.settings.tabs.message") },
    { key: "finance", label: t("admin.settings.tabs.finance") },
    { key: "security", label: t("admin.settings.tabs.security") },
    { key: "warehouse", label: t("admin.settings.tabs.warehouse") },
    { key: "legal", label: t("admin.settings.tabs.legal") },
  ];
}

export function tabTitle(t: T): Record<SettingsTab, string> {
  return {
    listing: t("admin.settings.tabTitle.listing"),
    message: t("admin.settings.tabTitle.message"),
    finance: t("admin.settings.tabTitle.finance"),
    security: t("admin.settings.tabTitle.security"),
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
    message: withLabels(FIELD_DEFS.message),
    finance: withLabels(FIELD_DEFS.finance),
    security: withLabels(FIELD_DEFS.security),
  };
}

const DEFAULTS: Settings = {
  minProductPrice: 10,
  maxProductPrice: 100000,
  maxMessageLength: 1000,
  // Ayar satırı yokken gösterimde kullanılan oran — kırılım ekranlarıyla TEK kaynak.
  pspFeeRate: DEFAULT_PSP_FEE_RATE,
  // Backend'deki ADMIN_SESSION_TIMEOUT_SETTING.default ile aynı olmalı: ayar
  // satırı yokken form, sunucunun gerçekte uyguladığı değeri göstermeli.
  adminSessionTimeoutMinutes: 30,
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
