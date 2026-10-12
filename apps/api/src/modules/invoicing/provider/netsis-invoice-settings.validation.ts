import {
  NETSIS_INVOICE_SETTING_DEFINITIONS,
  netsisInvoiceSettingsReadiness,
  parseNetsisInvoiceSettings,
  type NetsisInvoiceSettingDefinition,
} from "./netsis-invoice-settings";

/**
 * Netsis faturalama ayarlarının admin yüzü için SAF doğrulama/özet mantığı.
 *
 * Kural tek kaynaktan gelir: bir değerin geçerli olup olmadığına
 * `parseNetsisInvoiceSettings` (sağlayıcının belge keserken okuduğu ayrıştırıcı)
 * karar verir — burada ikinci bir uzunluk/seri kuralı YAZILMAZ. Tek anahtarlı
 * bir harita ayrıştırılır; anahtar `netsisInvoiceSettingsReadiness` çıktısında
 * kalıyorsa değer ayrıştırıcıda elenmiş, yani geçersizdir.
 */

export type NetsisSettingGroup = "cari" | "serial" | "item" | "document";

export interface NetsisSettingState {
  key: string;
  /** Kayıtlı değer; satır yoksa varsayılan. */
  value: string;
  default: string;
  /** Dolu bir değer ayrıştırıcıda elenmediyse (boş değer geçersiz SAYILMAZ — eksiktir). */
  valid: boolean;
  /** Belge kesmek için dolu olması gerekir. */
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

const DEFINITIONS = new Map<string, NetsisInvoiceSettingDefinition>(
  NETSIS_INVOICE_SETTING_DEFINITIONS.map((row) => [row.key, row]),
);

/** Ekrandaki kart: anahtar önekinden (`netsis.cari.*`, `netsis.serial.*`, kalan = hizmet kartı). */
export function netsisSettingGroup(key: string): NetsisSettingGroup {
  if (key.startsWith("netsis.cari.")) return "cari";
  if (key.startsWith("netsis.serial.")) return "serial";
  if (key.startsWith("netsis.item.")) return "item";
  // Belge görünümü ayarları (ör. e-Arşiv sorgulama adresi): kart kodu değil.
  return "document";
}

/** Boş haritada eksik görünen anahtarlar = zorunlu olanlar. */
const REQUIRED_KEYS: ReadonlySet<string> = new Set(
  netsisInvoiceSettingsReadiness(parseNetsisInvoiceSettings(new Map())),
);

/** Dolu bir değer ayrıştırıcıdan geçiyor mu. Boş değer için çağrılmaz. */
function survivesParsing(key: string, value: string): boolean {
  const readiness = netsisInvoiceSettingsReadiness(
    parseNetsisInvoiceSettings(new Map([[key, value]])),
  );
  return !readiness.includes(key);
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
  if (!definition) return { ok: false, reason: "unknown" };

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
  if (!survivesParsing(key, trimmed)) return { ok: false, reason: "invalid" };
  return {
    ok: true,
    value:
      netsisSettingGroup(key) === "serial" ? trimmed.toUpperCase() : trimmed,
  };
}

/** Kayıtlı ham değerlerden (anahtar → değer) ekranın satırları ve hazırlık durumu. */
export function describeNetsisSettings(stored: ReadonlyMap<string, string>): {
  settings: NetsisSettingState[];
  readiness: NetsisSettingsReadiness;
} {
  const settings = NETSIS_INVOICE_SETTING_DEFINITIONS.map(
    (definition): NetsisSettingState => {
      const value = stored.get(definition.key) ?? definition.value;
      const filled = value.trim() !== "";
      const valid =
        definition.type === "boolean" ||
        !filled ||
        survivesParsing(definition.key, value);
      return {
        key: definition.key,
        value,
        default: definition.value,
        valid,
        required: REQUIRED_KEYS.has(definition.key),
        type: definition.type,
        group: netsisSettingGroup(definition.key),
      };
    },
  );

  const missing = settings
    .filter((row) => row.required && row.value.trim() === "")
    .map((row) => row.key);
  const invalid = settings.filter((row) => !row.valid).map((row) => row.key);
  const blockers = netsisInvoiceSettingsReadiness(
    parseNetsisInvoiceSettings(stored),
  );

  return {
    settings,
    readiness: {
      ready: blockers.length === 0,
      missing,
      invalid,
    },
  };
}
