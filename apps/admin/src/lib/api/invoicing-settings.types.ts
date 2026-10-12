/**
 * Faturalama Ayarları (Sistem → Faturalama Ayarları) uç tipleri.
 * API: `apps/api/.../admin/finance/invoicing-settings` — şekil orada tanımlıdır.
 */

export type InvoicingProvider = "elogo" | "netsis";
export type NetsisMode = "stub" | "live";
export type InvoicingSettingGroup = "cari" | "serial" | "item";

export interface InvoicingSettingRow {
  key: string;
  /** Kayıtlı değer; satır yoksa varsayılan. */
  value: string;
  default: string;
  /** Dolu bir değer sunucu kuralından geçmiyorsa false. */
  valid: boolean;
  required: boolean;
  type: "string" | "boolean";
  group: InvoicingSettingGroup;
}

export interface InvoicingReadiness {
  ready: boolean;
  missing: string[];
  invalid: string[];
}

export interface InvoicingFeeType {
  type: string;
  /** Girdinin ayar anahtarı (`settings[].key`). */
  settingKey: string;
  /** Mevcut fatura türü etiketi anahtarı (admin.finance.invoices.types.*). */
  labelKey: string;
}

export interface InvoicingSettingsState {
  provider: InvoicingProvider;
  netsisEnabled: boolean;
  netsisMode: NetsisMode;
  settings: InvoicingSettingRow[];
  readiness: InvoicingReadiness;
  feeTypes: InvoicingFeeType[];
}

export interface NetsisPingResult {
  ok: boolean;
  mode: NetsisMode;
  version?: string | null;
  authenticated?: boolean;
  /** İstek dilinde, taşıma ayrıntısı içermeyen mesaj. */
  error?: string;
}

/** `PUT /admin/invoicing/settings` gövdesi. */
export interface InvoicingSettingsPayload {
  values: Record<string, string | boolean>;
}
