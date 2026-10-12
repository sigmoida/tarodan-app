import { z } from "zod";
import type { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import type {
  InvoicingFeeType,
  InvoicingSettingGroup,
  InvoicingSettingRow,
  InvoicingSettingsState,
} from "@/lib/api/invoicing-settings.types";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Faturalama Ayarları ekranının saf mantığı. Kurallar sunucudakinin aynasıdır
 * (`netsis-invoice-settings.ts`): seri 3 karakter A-Z0-9, cari kodu en çok 15,
 * hizmet kartı kodu en çok 35 karakter; metinler kırpılır. Sunucu aynı
 * kuralları yine uygular — buradaki doğrulama yalnız erken geri bildirimdir.
 */
export const SERIAL_PATTERN = /^[A-Z0-9]{3}$/;
export const CARI_CODE_MAX_LENGTH = 15;
export const ITEM_CODE_MAX_LENGTH = 35;

export type InvoicingFormValues = Record<string, string | boolean>;
export type InvoicingSettingsPayloadValues = Record<string, string | boolean>;

/** Kart sırası (ekranda yukarıdan aşağıya). */
export const SETTING_GROUPS: readonly InvoicingSettingGroup[] = [
  "cari",
  "serial",
  "item",
];

/**
 * Ayar anahtarları noktalıdır (`netsis.serial.earchive`); react-hook-form
 * noktayı iç içe yol sayar, bu yüzden form alanı adı noktasızdır.
 */
export const fieldName = (key: string): string => key.replaceAll(".", "__");

/** API yanıtını (zarflı ya da düz) ekran durumuna çevirir; şekil bozuksa null. */
export function readInvoicingSettings(
  raw: unknown,
): InvoicingSettingsState | null {
  const body = raw as
    | { data?: InvoicingSettingsState }
    | InvoicingSettingsState
    | undefined;
  const state = body && "data" in body && body.data ? body.data : body;
  if (!state || !("settings" in state) || !Array.isArray(state.settings)) {
    return null;
  }
  return state as InvoicingSettingsState;
}

/** Sunucu satırları → form değerleri (mantıksal ayar boolean, kalanı metin). */
export function toFormValues(
  rows: readonly InvoicingSettingRow[],
): InvoicingFormValues {
  return Object.fromEntries(
    rows.map((row) => [
      fieldName(row.key),
      row.type === "boolean" ? row.value === "true" : row.value,
    ]),
  );
}

/** Saklanacak biçim: metin kırpılır, seri büyük harfe çevrilir. */
export function normalizeValue(
  row: InvoicingSettingRow,
  value: string | boolean | undefined,
): string | boolean {
  if (row.type === "boolean") return value === true || value === "true";
  const text = typeof value === "string" ? value.trim() : "";
  return row.group === "serial" ? text.toUpperCase() : text;
}

export type InvoicingViolation = "serial" | "cariMax" | "itemMax";

/** Normalize edilmiş bir değerin ihlali; boş değer geçerlidir (ayarı temizler). */
export function violationOf(
  row: InvoicingSettingRow,
  normalized: string | boolean,
): InvoicingViolation | null {
  if (typeof normalized !== "string" || normalized === "") return null;
  if (row.group === "serial") {
    return SERIAL_PATTERN.test(normalized) ? null : "serial";
  }
  if (row.group === "cari") {
    return normalized.length > CARI_CODE_MAX_LENGTH ? "cariMax" : null;
  }
  return normalized.length > ITEM_CODE_MAX_LENGTH ? "itemMax" : null;
}

const VIOLATION_PARAMS: Record<InvoicingViolation, Record<string, number>> = {
  serial: {},
  cariMax: { max: CARI_CODE_MAX_LENGTH },
  itemMax: { max: ITEM_CODE_MAX_LENGTH },
};

/** Formun zod şeması: her ayarın kuralı kendi alan adı altında raporlanır. */
export function invoicingSettingsSchema(
  t: T,
  rows: readonly InvoicingSettingRow[],
) {
  return z
    .record(z.union([z.string(), z.boolean()]))
    .superRefine((values, ctx) => {
      for (const row of rows) {
        const violation = violationOf(
          row,
          normalizeValue(row, values[fieldName(row.key)]),
        );
        if (!violation) continue;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [fieldName(row.key)],
          message: t(
            `admin.invoicingSettings.validation.${violation}` as MessageKey,
            VIOLATION_PARAMS[violation],
          ),
        });
      }
    });
}

/**
 * PUT gövdesi: yalnız DEĞİŞEN ayarlar (normalize edilmiş haliyle). Değişmeyen
 * bir ayar gönderilmez; böylece denetim kaydı yalnız gerçek değişimi yazar.
 */
export function changedSettings(
  values: InvoicingFormValues,
  rows: readonly InvoicingSettingRow[],
): InvoicingSettingsPayloadValues {
  const changed: InvoicingSettingsPayloadValues = {};
  for (const row of rows) {
    const next = normalizeValue(row, values[fieldName(row.key)]);
    const current = normalizeValue(row, row.value);
    if (next !== current) changed[row.key] = next;
  }
  return changed;
}

export function rowsInGroup(
  rows: readonly InvoicingSettingRow[],
  group: InvoicingSettingGroup,
): InvoicingSettingRow[] {
  return rows.filter((row) => row.group === group);
}

/** `netsis.serial.earchive` → `earchive` (cari ve seri etiketlerinin katalog anahtarı). */
const lastSegment = (key: string): string => key.split(".").pop() ?? key;

/**
 * Ayarın etiketi: hizmet kartı mevcut fatura türü etiketini (API'nin
 * `feeTypes[].labelKey`'i) kullanır, cari ve seri ayarlarının kendi etiketi var.
 */
export function settingLabelKey(
  row: InvoicingSettingRow,
  feeTypes: readonly InvoicingFeeType[],
): MessageKey {
  if (row.group === "item") {
    const fee = feeTypes.find((item) => item.settingKey === row.key);
    if (fee) return fee.labelKey as MessageKey;
  }
  return `admin.invoicingSettings.fields.${lastSegment(row.key)}.label` as MessageKey;
}

/** Yardım metni yalnız cari/seri ayarlarında vardır. */
export function settingHelperKey(
  row: InvoicingSettingRow,
): MessageKey | undefined {
  return row.group === "item"
    ? undefined
    : (`admin.invoicingSettings.fields.${lastSegment(row.key)}.helper` as MessageKey);
}

export interface ReadinessItem {
  key: string;
  status: "missing" | "invalid";
  labelKey: MessageKey;
}

/** Hazırlık rozetleri: önce geçersizler, sonra eksikler; her biri kendi etiketiyle. */
export function readinessItems(
  state: Pick<InvoicingSettingsState, "settings" | "readiness" | "feeTypes">,
): ReadinessItem[] {
  const labelOf = (key: string): MessageKey => {
    const row = state.settings.find((item) => item.key === key);
    return row
      ? settingLabelKey(row, state.feeTypes)
      : (key as MessageKey);
  };
  return [
    ...state.readiness.invalid.map((key) => ({
      key,
      status: "invalid" as const,
      labelKey: labelOf(key),
    })),
    ...state.readiness.missing.map((key) => ({
      key,
      status: "missing" as const,
      labelKey: labelOf(key),
    })),
  ];
}
