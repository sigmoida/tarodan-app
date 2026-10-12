import {
  NETSIS_ACCOUNTING_SETTING_DEFINITIONS,
  isValidNetsisAccountingValue,
  netsisAccountingSettingsReadiness,
  parseNetsisAccountingSettings,
} from "../accounting/netsis-accounting-settings";
import {
  NETSIS_INVOICE_SETTING_DEFINITIONS,
  netsisInvoiceSettingsReadiness,
  parseNetsisInvoiceSettings,
  type NetsisInvoiceSettingDefinition,
} from "./netsis-invoice-settings";

/**
 * Netsis ayarlarının (faturalama + muhasebe senkronu) admin yüzü için SAF
 * doğrulama/özet mantığı.
 *
 * Kural tek kaynaktan gelir: bir değerin geçerli olup olmadığına ayarın kendi
 * ayrıştırıcısı (`parseNetsisInvoiceSettings`, `normalizeNetsisAccountCode`)
 * karar verir — burada ikinci bir uzunluk/seri kuralı YAZILMAZ. Fatura
 * tarafında tek anahtarlı bir harita ayrıştırılır; anahtar
 * `netsisInvoiceSettingsReadiness` çıktısında kalıyorsa değer ayrıştırıcıda
 * elenmiş, yani geçersizdir.
 *
 * İki BÖLÜM vardır ve hazırlıkları ayrıdır: fatura hazırlığı "Netsis ile belge
 * kesilebilir mi", muhasebe hazırlığı "tahsilat/ödeme kayıtları yazılabilir mi"
 * sorusunu cevaplar. Muhasebe ayarı eksik diye fatura "hazır değil"
 * görünmemeli.
 */

export type NetsisSettingGroup =
  | "cari"
  | "serial"
  | "item"
  | "document"
  | "account";

export interface NetsisSettingState {
  key: string;
  /** Kayıtlı değer; satır yoksa varsayılan. */
  value: string;
  default: string;
  /** Dolu bir değer ayrıştırıcıda elenmediyse (boş değer geçersiz SAYILMAZ — eksiktir). */
  valid: boolean;
  /** Bölümün işi (belge kesmek / muhasebe kaydı yazmak) için dolu olması gerekir. */
  required: boolean;
  /** Ekran girdiyi buna göre çizer (kutucuk / metin). */
  type: NetsisInvoiceSettingDefinition["type"];
  group: NetsisSettingGroup;
}

export interface NetsisSettingsReadiness {
  ready: boolean;
  missing: string[];
  invalid: string[];
}

export type NetsisSettingValueCheck =
  | { ok: true; value: string }
  | { ok: false; reason: "unknown" | "type" | "invalid" };

interface NetsisSettingsSection {
  definitions: readonly NetsisInvoiceSettingDefinition[];
  /** Dolu bir değer ayrıştırıcıda elenmiyor mu. Boş değer için çağrılmaz. */
  survives(key: string, value: string): boolean;
  /** Kayıtlı haritayla bölümün işini durduran (eksik/geçersiz) anahtarlar. */
  blockers(stored: ReadonlyMap<string, string>): string[];
}

/** Dolu bir fatura değeri ayrıştırıcıdan geçiyor mu. */
function survivesInvoiceParsing(key: string, value: string): boolean {
  const readiness = netsisInvoiceSettingsReadiness(
    parseNetsisInvoiceSettings(new Map([[key, value]])),
  );
  return !readiness.includes(key);
}

const INVOICE_SECTION: NetsisSettingsSection = {
  definitions: NETSIS_INVOICE_SETTING_DEFINITIONS,
  survives: survivesInvoiceParsing,
  blockers: (stored) =>
    netsisInvoiceSettingsReadiness(parseNetsisInvoiceSettings(stored)),
};

const ACCOUNTING_SECTION: NetsisSettingsSection = {
  definitions: NETSIS_ACCOUNTING_SETTING_DEFINITIONS,
  survives: isValidNetsisAccountingValue,
  blockers: (stored) =>
    netsisAccountingSettingsReadiness(parseNetsisAccountingSettings(stored)),
};

const SECTIONS: readonly NetsisSettingsSection[] = [
  INVOICE_SECTION,
  ACCOUNTING_SECTION,
];

/** Ekranın ve PUT'un tanıdığı TÜM ayarlar (önce fatura, sonra muhasebe). */
export const NETSIS_SETTING_DEFINITIONS: readonly NetsisInvoiceSettingDefinition[] =
  SECTIONS.flatMap((section) => section.definitions);

const DEFINITIONS = new Map<string, NetsisInvoiceSettingDefinition>(
  NETSIS_SETTING_DEFINITIONS.map((row) => [row.key, row]),
);

const SECTION_OF = new Map<string, NetsisSettingsSection>(
  SECTIONS.flatMap((section) =>
    section.definitions.map((row) => [row.key, section] as const),
  ),
);

/** Ekrandaki kart: anahtar önekinden (`netsis.cari.*`, `netsis.serial.*`, …). */
export function netsisSettingGroup(key: string): NetsisSettingGroup {
  if (key.startsWith("netsis.cari.")) return "cari";
  if (key.startsWith("netsis.serial.")) return "serial";
  if (key.startsWith("netsis.item.")) return "item";
  // Muhasebe senkronu: ana anahtar ve hesap kodları aynı kartta.
  if (key.startsWith("netsis.account.") || key.startsWith("netsis.accounting.")) {
    return "account";
  }
  // Belge görünümü ayarları (ör. e-Arşiv sorgulama adresi): kart kodu değil.
  return "document";
}

/**
 * Bölümün zorunlu anahtarları = metin değerleri boşken işi durduranlar.
 * Mantıksal anahtarlar (ör. senkronun açık olması) korunur: muhasebe hesapları
 * yalnız senkron açıkken zorunludur.
 */
function requiredKeys(
  section: NetsisSettingsSection,
  stored: ReadonlyMap<string, string>,
): ReadonlySet<string> {
  const togglesOnly = new Map(
    [...stored].filter(([key]) => DEFINITIONS.get(key)?.type === "boolean"),
  );
  return new Set(section.blockers(togglesOnly));
}

/**
 * PUT gövdesindeki tek değeri doğrular ve saklanacak biçime getirir: metin
 * kırpılır, seri büyük harfe çevrilir, mantıksal değer "true"/"false" olur.
 * Boş metin geçerlidir (ayarı temizler → "eksik" görünür).
 */
export function checkNetsisSettingValue(
  key: string,
  raw: unknown,
): NetsisSettingValueCheck {
  const definition = DEFINITIONS.get(key);
  const section = SECTION_OF.get(key);
  if (!definition || !section) return { ok: false, reason: "unknown" };

  if (definition.type === "boolean") {
    if (typeof raw === "boolean") return { ok: true, value: String(raw) };
    if (typeof raw === "string") {
      const text = raw.trim().toLowerCase();
      if (text === "true" || text === "false") return { ok: true, value: text };
    }
    return { ok: false, reason: "type" };
  }

  if (typeof raw !== "string") return { ok: false, reason: "type" };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: "" };
  if (!section.survives(key, trimmed)) return { ok: false, reason: "invalid" };
  return {
    ok: true,
    value:
      netsisSettingGroup(key) === "serial" ? trimmed.toUpperCase() : trimmed,
  };
}

function describeSection(
  section: NetsisSettingsSection,
  stored: ReadonlyMap<string, string>,
): { settings: NetsisSettingState[]; readiness: NetsisSettingsReadiness } {
  const required = requiredKeys(section, stored);
  const settings = section.definitions.map(
    (definition): NetsisSettingState => {
      const value = stored.get(definition.key) ?? definition.value;
      const filled = value.trim() !== "";
      const valid =
        definition.type === "boolean" ||
        !filled ||
        section.survives(definition.key, value.trim());
      return {
        key: definition.key,
        value,
        default: definition.value,
        valid,
        required: required.has(definition.key),
        type: definition.type,
        group: netsisSettingGroup(definition.key),
      };
    },
  );
  return {
    settings,
    readiness: {
      ready: section.blockers(stored).length === 0,
      missing: settings
        .filter((row) => row.required && row.value.trim() === "")
        .map((row) => row.key),
      invalid: settings.filter((row) => !row.valid).map((row) => row.key),
    },
  };
}

/**
 * Kayıtlı ham değerlerden (anahtar → değer) ekranın satırları ve iki bölümün
 * hazırlık durumu: `readiness` belge kesimi, `accountingReadiness` muhasebe
 * senkronu içindir (senkron kapalıyken hazır sayılır).
 */
export function describeNetsisSettings(stored: ReadonlyMap<string, string>): {
  settings: NetsisSettingState[];
  readiness: NetsisSettingsReadiness;
  accountingReadiness: NetsisSettingsReadiness;
} {
  const invoice = describeSection(INVOICE_SECTION, stored);
  const accounting = describeSection(ACCOUNTING_SECTION, stored);
  return {
    settings: [...invoice.settings, ...accounting.settings],
    readiness: invoice.readiness,
    accountingReadiness: accounting.readiness,
  };
}
