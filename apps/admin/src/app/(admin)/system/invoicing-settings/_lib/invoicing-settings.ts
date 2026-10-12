import { z } from "zod";
import type { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import {
  NETSIS_ACCOUNT_CODE_MAX,
  NETSIS_CARI_CODE_MAX,
  NETSIS_ITEM_CODE_MAX,
  isValidNetsisSerial,
} from "@tarodan/types";
import type {
  InvoicingFeeType,
  InvoicingSettingGroup,
  InvoicingSettingRow,
  InvoicingSettingsState,
  NetsisSyncRecordRow,
  NetsisSyncStatus,
} from "@/lib/api/invoicing-settings.types";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Faturalama Ayarları ekranının saf mantığı. Seri deseni ve cari / hizmet
 * kartı / muhasebe hesap kodu sınırları sunucuyla ORTAKTIR (`@tarodan/types`
 * → `netsis-settings.ts`); metinler kırpılır. Sunucu aynı kuralları yine
 * uygular — buradaki doğrulama yalnız erken geri bildirimdir.
 */

export type InvoicingFormValues = Record<string, string | boolean>;
export type InvoicingSettingsPayloadValues = Record<string, string | boolean>;

/** Kart sırası (ekranda yukarıdan aşağıya). */
export const SETTING_GROUPS: readonly InvoicingSettingGroup[] = [
  "cari",
  "serial",
  "item",
  "document",
  "account",
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

export type InvoicingViolation =
  | "serial"
  | "cariMax"
  | "itemMax"
  | "accountMax";

/** Normalize edilmiş bir değerin ihlali; boş değer geçerlidir (ayarı temizler). */
export function violationOf(
  row: InvoicingSettingRow,
  normalized: string | boolean,
): InvoicingViolation | null {
  if (typeof normalized !== "string" || normalized === "") return null;
  if (row.group === "serial") {
    return isValidNetsisSerial(normalized) ? null : "serial";
  }
  if (row.group === "cari") {
    return normalized.length > NETSIS_CARI_CODE_MAX ? "cariMax" : null;
  }
  if (row.group === "item") {
    return normalized.length > NETSIS_ITEM_CODE_MAX ? "itemMax" : null;
  }
  if (row.group === "account") {
    return normalized.length > NETSIS_ACCOUNT_CODE_MAX ? "accountMax" : null;
  }
  // Belge grubu (ör. sorgulama adresi): biçim kuralı sunucuda.
  return null;
}

const VIOLATION_PARAMS: Record<InvoicingViolation, Record<string, number>> = {
  serial: {},
  cariMax: { max: NETSIS_CARI_CODE_MAX },
  itemMax: { max: NETSIS_ITEM_CODE_MAX },
  accountMax: { max: NETSIS_ACCOUNT_CODE_MAX },
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

/** Hazırlık bloğu: belge kesimi ya da muhasebe senkronu. */
export type ReadinessSection = "invoicing" | "accounting";

/**
 * Hazırlık rozetleri: önce geçersizler, sonra eksikler; her biri kendi
 * etiketiyle. `section` hangi bloğun (belge kesimi / muhasebe) listesini seçer.
 */
export function readinessItems(
  state: Pick<
    InvoicingSettingsState,
    "settings" | "readiness" | "accountingReadiness" | "feeTypes"
  >,
  section: ReadinessSection = "invoicing",
): ReadinessItem[] {
  const readiness =
    section === "accounting" ? state.accountingReadiness : state.readiness;
  const labelOf = (key: string): MessageKey => {
    const row = state.settings.find((item) => item.key === key);
    return row
      ? settingLabelKey(row, state.feeTypes)
      : (key as MessageKey);
  };
  return [
    ...readiness.invalid.map((key) => ({
      key,
      status: "invalid" as const,
      labelKey: labelOf(key),
    })),
    ...readiness.missing.map((key) => ({
      key,
      status: "missing" as const,
      labelKey: labelOf(key),
    })),
  ];
}

/** Senkron kaydı durumu → rozet varyantı (tek kaynak). */
export const SYNC_STATUS_VARIANT: Record<
  NetsisSyncStatus,
  "success" | "outline" | "danger"
> = {
  synced: "success",
  pending: "outline",
  processing: "outline",
  failed: "danger",
  skipped: "outline",
};

export const SYNC_ERROR_MAX_LENGTH = 80;

/** Uzun son hata metnini tabloda tek satıra sığacak şekilde kısaltır. */
export function truncateSyncError(
  error: string | null,
  max: number = SYNC_ERROR_MAX_LENGTH,
): string | null {
  if (!error) return null;
  return error.length > max ? `${error.slice(0, max - 1).trimEnd()}…` : error;
}

/** Yalnız başarısız kayıt elle yeniden kuyruğa alınır. */
export const canRetrySync = (record: Pick<NetsisSyncRecordRow, "status">) =>
  record.status === "failed";
