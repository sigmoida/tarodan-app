import { FiscalInvoiceType, type PrismaClient } from "@prisma/client";
import type { EInvoiceScenario } from "./e-invoice-provider";

/**
 * Netsis faturalama ayarları — çalışma anında değişebilen (`PlatformSetting`)
 * kodlar. Cari kodu, seri ve hizmet kartı kodları muhasebenin Netsis'te açtığı
 * kayıtlara bağlıdır; deploy gerektirmeden admin'den değiştirilebilmeli
 * (CLAUDE.md §12). Hiçbir kod koda gömülü değildir.
 *
 * Bu dosya bilerek DI'sız: hem sağlayıcı (`NetsisInvoiceProvider`) hem
 * referans seed'i (`prisma/seed-production.ts`) anahtarları ve varsayılanları
 * buradan okur — iki listeye bölünmez.
 */

/**
 * Kendi hizmet kartı olan belge türleri. İade faturası (`return_invoice`)
 * listede yok: iade, orijinal belgenin kartıyla kesilir.
 */
export type NetsisItemInvoiceType = Exclude<FiscalInvoiceType, "return_invoice">;

/**
 * Ücret (hizmet) türleri — enum'dan TÜRETİLİR ki şemaya eklenen yeni bir ücret
 * türünün ayarı kendiliğinden doğsun. Ürün satışı (`platform_sale`) ücret
 * değildir, tek ürün kartı (`netsis.item.productSale`) kullanır.
 */
export const NETSIS_FEE_INVOICE_TYPES: readonly NetsisItemInvoiceType[] = (
  Object.values(FiscalInvoiceType) as FiscalInvoiceType[]
).filter(
  (type): type is NetsisItemInvoiceType =>
    type !== FiscalInvoiceType.platform_sale &&
    type !== FiscalInvoiceType.return_invoice,
);

export const NETSIS_INVOICE_SETTING_KEYS = {
  /** Bireysel (TCKN) ve misafir alıcıların ORTAK perakende carisi. */
  retailCariCode: "netsis.cari.retailCode",
  /** VKN'li kurumsal alıcının carisi ilk faturada otomatik açılsın mı. */
  autoCreateCorporateCari: "netsis.cari.autoCreateCorporate",
  earchiveSerial: "netsis.serial.earchive",
  einvoiceSerial: "netsis.serial.einvoice",
  /** Official Store ürün satışlarının (platform_sale) TEK kartı. */
  productSaleItem: "netsis.item.productSale",
  /**
   * OPSİYONEL: alıcının e-Arşiv belgesini doğrulayabileceği sorgulama bağlantısı.
   * Görsel kopya PDF'inde "Doğrulama" bloğu olarak basılır; boşsa blok yoktur.
   * Hazırlık kontrolüne (`netsisInvoiceSettingsReadiness`) GİRMEZ.
   */
  earchiveVerificationUrl: "netsis.earchive.verificationUrl",
} as const;

/** Belge türünün hizmet/ürün kartı ayar anahtarı. */
export function netsisItemSettingKey(type: NetsisItemInvoiceType): string {
  return type === FiscalInvoiceType.platform_sale
    ? NETSIS_INVOICE_SETTING_KEYS.productSaleItem
    : `netsis.item.${type}`;
}

/**
 * Alan uzunlukları. VERIFY: Netsis tablolarında `TBLCASABIT.CARI_KOD`
 * varchar(15), `TBLSTSABIT.STOK_KODU` varchar(35) varsayıldı; GİB seri
 * öneki 3 karakterdir (ör. `TRD`).
 */
export const NETSIS_CARI_CODE_MAX_LENGTH = 15;
export const NETSIS_ITEM_CODE_MAX_LENGTH = 35;
const SERIAL_PATTERN = /^[A-Z0-9]{3}$/;

export interface NetsisInvoiceSettings {
  /** Boş = yapılandırılmamış. */
  retailCariCode: string;
  autoCreateCorporateCari: boolean;
  serials: Record<EInvoiceScenario, string>;
  itemCodes: Record<NetsisItemInvoiceType, string>;
  /** Boş = PDF'te doğrulama bloğu yok. Yalnızca http(s) bağlantısı kabul edilir. */
  earchiveVerificationUrl: string;
}

/** Seed ve admin ekranı için satır tanımı. */
export interface NetsisInvoiceSettingDefinition {
  key: string;
  value: string;
  type: "string" | "boolean";
  description: string;
}

const ITEM_TYPES: readonly NetsisItemInvoiceType[] = [
  FiscalInvoiceType.platform_sale,
  ...NETSIS_FEE_INVOICE_TYPES,
];

/**
 * Varsayılan satırlar. Kodların varsayılanı BOŞTUR: muhasebe kartı açmadan
 * fatura kesilmesin — eksik ayar `configuration` reddi olarak görünür.
 */
export const NETSIS_INVOICE_SETTING_DEFINITIONS: readonly NetsisInvoiceSettingDefinition[] =
  [
    {
      key: NETSIS_INVOICE_SETTING_KEYS.retailCariCode,
      value: "",
      type: "string",
      description:
        "Netsis: bireysel ve misafir alıcıların ortak perakende cari kodu",
    },
    {
      key: NETSIS_INVOICE_SETTING_KEYS.autoCreateCorporateCari,
      value: "true",
      type: "boolean",
      description:
        "Netsis: VKN'li kurumsal alıcının carisi ilk faturada otomatik açılsın",
    },
    {
      key: NETSIS_INVOICE_SETTING_KEYS.earchiveSerial,
      value: "",
      type: "string",
      description: "Netsis: e-Arşiv belge serisi (3 karakter)",
    },
    {
      key: NETSIS_INVOICE_SETTING_KEYS.einvoiceSerial,
      value: "",
      type: "string",
      description: "Netsis: e-Fatura belge serisi (3 karakter)",
    },
    {
      key: NETSIS_INVOICE_SETTING_KEYS.earchiveVerificationUrl,
      value: "",
      type: "string",
      description:
        "Netsis: e-Arşiv belge doğrulama bağlantısı (opsiyonel, PDF'te basılır)",
    },
    ...ITEM_TYPES.map(
      (type): NetsisInvoiceSettingDefinition => ({
        key: netsisItemSettingKey(type),
        value: "",
        type: "string",
        description: `Netsis: ${type} belgesinin hizmet/stok kartı kodu`,
      }),
    ),
  ];

/** Kod: kırpılır; boş ya da azami uzunluğu aşan değer YOK sayılır. */
function code(raw: string | undefined, maxLength: number): string {
  const value = (raw ?? "").trim();
  return value.length > 0 && value.length <= maxLength ? value : "";
}

function serial(raw: string | undefined): string {
  const value = (raw ?? "").trim().toUpperCase();
  return SERIAL_PATTERN.test(value) ? value : "";
}

function httpUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  return /^https?:\/\/\S+$/i.test(value) ? value : "";
}

/** "true"/"1"/"yes"/"on" → true; bozuk ya da yok → varsayılan. */
function bool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const value = raw.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(value)) return true;
  if (["false", "0", "no", "off"].includes(value)) return false;
  return fallback;
}

/** Ham `settingKey → settingValue` haritasından tipli ayarlar. */
export function parseNetsisInvoiceSettings(
  values: ReadonlyMap<string, string>,
): NetsisInvoiceSettings {
  const keys = NETSIS_INVOICE_SETTING_KEYS;
  const itemCodes = Object.fromEntries(
    ITEM_TYPES.map((type) => [
      type,
      code(values.get(netsisItemSettingKey(type)), NETSIS_ITEM_CODE_MAX_LENGTH),
    ]),
  ) as Record<NetsisItemInvoiceType, string>;
  return {
    retailCariCode: code(
      values.get(keys.retailCariCode),
      NETSIS_CARI_CODE_MAX_LENGTH,
    ),
    autoCreateCorporateCari: bool(
      values.get(keys.autoCreateCorporateCari),
      true,
    ),
    serials: {
      EARCHIVE: serial(values.get(keys.earchiveSerial)),
      EINVOICE: serial(values.get(keys.einvoiceSerial)),
    },
    itemCodes,
    earchiveVerificationUrl: httpUrl(values.get(keys.earchiveVerificationUrl)),
  };
}

/** Ayarların tamamı TEK sorguda okunur (belge başına onlarca round-trip değil). */
export async function loadNetsisInvoiceSettings(
  // PrismaClient (PrismaService değil): seed grafiği Nest servisini çekmesin.
  prisma: Pick<PrismaClient, "platformSetting">,
): Promise<NetsisInvoiceSettings> {
  const rows = await prisma.platformSetting.findMany({
    where: {
      settingKey: {
        in: NETSIS_INVOICE_SETTING_DEFINITIONS.map((row) => row.key),
      },
    },
    select: { settingKey: true, settingValue: true },
  });
  return parseNetsisInvoiceSettings(
    new Map(rows.map((row) => [row.settingKey, row.settingValue])),
  );
}

/**
 * Eksik ya da geçersiz ayarların ANAHTARLARI — boşsa Netsis faturası
 * kesilebilir. Admin ekranı bunu gösterecek; sağlayıcı da belge başına
 * yalnız o belgenin ihtiyaç duyduklarını aynı kurala göre sorar.
 */
export function netsisInvoiceSettingsReadiness(
  settings: NetsisInvoiceSettings,
): string[] {
  const keys = NETSIS_INVOICE_SETTING_KEYS;
  return [
    ...(settings.retailCariCode ? [] : [keys.retailCariCode]),
    ...(settings.serials.EARCHIVE ? [] : [keys.earchiveSerial]),
    ...(settings.serials.EINVOICE ? [] : [keys.einvoiceSerial]),
    ...ITEM_TYPES.filter((type) => !settings.itemCodes[type]).map(
      netsisItemSettingKey,
    ),
  ];
}
