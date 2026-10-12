import type { EInvoiceProviderName, PrismaClient } from "@prisma/client";
import { invoiceProviderName } from "../../../config/invoice-provider";
import {
  netsisSettingBoolean,
  netsisSettingCode,
  type NetsisInvoiceSettingDefinition,
} from "../provider/netsis-invoice-settings";

/**
 * Netsis muhasebe senkronunun ayarları — çalışma anında değişebilen
 * (`PlatformSetting`) anahtar ve hesap kodları. Hesap kodlarını muhasebeci
 * verecek; hiçbiri koda gömülü değildir ve varsayılanları BOŞTUR (CLAUDE.md
 * §12). Senkron varsayılan olarak KAPALIDIR: kapalıyken olaylar `skipped`
 * satır açar, açıldığında bakım script'iyle yeniden kuyruğa alınabilir.
 *
 * Fatura ayarları gibi DI'sız: senkron servisi, admin ekranının doğrulaması ve
 * referans seed'i anahtarları buradan okur — iki listeye bölünmez.
 */

export const NETSIS_ACCOUNTING_SETTING_KEYS = {
  /** Ana anahtar. Kapalıyken Netsis'e hiçbir muhasebe kaydı yazılmaz. */
  enabled: "netsis.accounting.enabled",
  /**
   * PayTR ara (takas) hesabı — Netsis'te banka hesabı olarak açılır. Fatura
   * tahsilatları buraya girer, hakediş buradan şirket bankasına aktarılır.
   */
  paytrClearing: "netsis.account.paytrClearing",
  /** Şirketin hakediş aldığı ve satıcı ödemelerini yaptığı banka hesabı. */
  mainBank: "netsis.account.mainBank",
  /**
   * OPSİYONEL: PSP (PayTR) kesintisinin gider hesabı. Gateway'de masraf/gider
   * kaydı tipi henüz yok; kesinti hakediş aktarımının açıklamasına ve
   * gövdesine yazılır (docs/NETSIS.md → açık kalemler). Hazırlığa GİRMEZ.
   */
  pspFeeExpense: "netsis.account.pspFeeExpense",
} as const;

/**
 * VERIFY: Netsis banka hesap kodu (TBLBANKAHESAP) / muhasebe hesap kodu
 * (TBLMUPLAN, ör. `102.01.001`) uzunluğu. 30 karakter varsayıldı.
 */
export const NETSIS_ACCOUNT_CODE_MAX_LENGTH = 30;

export type NetsisAccountingAccount = Exclude<
  keyof typeof NETSIS_ACCOUNTING_SETTING_KEYS,
  "enabled"
>;

export interface NetsisAccountingSettings {
  enabled: boolean;
  /** Boş = yapılandırılmamış. */
  accounts: Record<NetsisAccountingAccount, string>;
}

const ACCOUNTS: readonly NetsisAccountingAccount[] = [
  "paytrClearing",
  "mainBank",
  "pspFeeExpense",
];

/** Senkron açıkken dolu olması ŞART olan hesaplar. */
const REQUIRED_ACCOUNTS: readonly NetsisAccountingAccount[] = [
  "paytrClearing",
  "mainBank",
];

/** Seed ve admin ekranı için satırlar (fatura ayarlarıyla aynı biçim). */
export const NETSIS_ACCOUNTING_SETTING_DEFINITIONS: readonly NetsisInvoiceSettingDefinition[] =
  [
    {
      key: NETSIS_ACCOUNTING_SETTING_KEYS.enabled,
      value: "false",
      type: "boolean",
      description:
        "Netsis: tahsilat ve ödemeleri muhasebeye aktar (fatura sağlayıcısı Netsis iken)",
    },
    {
      key: NETSIS_ACCOUNTING_SETTING_KEYS.paytrClearing,
      value: "",
      type: "string",
      description: "Netsis: PayTR ara hesabının banka hesap kodu",
    },
    {
      key: NETSIS_ACCOUNTING_SETTING_KEYS.mainBank,
      value: "",
      type: "string",
      description: "Netsis: şirket banka hesabının kodu (hakediş ve satıcı ödemeleri)",
    },
    {
      key: NETSIS_ACCOUNTING_SETTING_KEYS.pspFeeExpense,
      value: "",
      type: "string",
      description: "Netsis: PSP (PayTR) kesintisinin gider hesabı (opsiyonel)",
    },
  ];

/** Hesap kodunun TEK kuralı — ayrıştırıcı da admin doğrulaması da bunu kullanır. */
export function normalizeNetsisAccountCode(raw: string | undefined): string {
  return netsisSettingCode(raw, NETSIS_ACCOUNT_CODE_MAX_LENGTH);
}

/** Ham `settingKey → settingValue` haritasından tipli ayarlar. */
export function parseNetsisAccountingSettings(
  values: ReadonlyMap<string, string>,
): NetsisAccountingSettings {
  const keys = NETSIS_ACCOUNTING_SETTING_KEYS;
  return {
    enabled: netsisSettingBoolean(values.get(keys.enabled), false),
    accounts: Object.fromEntries(
      ACCOUNTS.map((account) => [
        account,
        normalizeNetsisAccountCode(values.get(keys[account])),
      ]),
    ) as Record<NetsisAccountingAccount, string>,
  };
}

/** Ayarların tamamı TEK sorguda okunur. */
export async function loadNetsisAccountingSettings(
  // PrismaClient (PrismaService değil): bakım script'i Nest servisini çekmesin.
  prisma: Pick<PrismaClient, "platformSetting">,
): Promise<NetsisAccountingSettings> {
  const rows = await prisma.platformSetting.findMany({
    where: {
      settingKey: {
        in: NETSIS_ACCOUNTING_SETTING_DEFINITIONS.map((row) => row.key),
      },
    },
    select: { settingKey: true, settingValue: true },
  });
  return parseNetsisAccountingSettings(
    new Map(rows.map((row) => [row.settingKey, row.settingValue])),
  );
}

/**
 * Senkronu DURDURAN anahtarlar: kapalıyken hiçbiri (senkron zaten çalışmaz),
 * açıkken eksik ya da geçersiz zorunlu hesaplar. Boşsa kayıtlar Netsis'e
 * yazılabilir. Admin ekranı ve cron aynı kuralı okur.
 */
export function netsisAccountingSettingsReadiness(
  settings: NetsisAccountingSettings,
): string[] {
  if (!settings.enabled) return [];
  return REQUIRED_ACCOUNTS.filter(
    (account) => !settings.accounts[account],
  ).map((account) => NETSIS_ACCOUNTING_SETTING_KEYS[account]);
}

/**
 * Senkron şu an YAZIYOR mu: ana anahtar açık VE yeni belgeleri Netsis kesiyor
 * (`INVOICE_PROVIDER=netsis`). eLogo döneminde Netsis'te faturanın carisi
 * yoktur; tahsilatı kapatacak belge de yoktur.
 */
export function netsisAccountingActive(
  settings: Pick<NetsisAccountingSettings, "enabled">,
  provider: EInvoiceProviderName = invoiceProviderName(),
): boolean {
  return settings.enabled && provider === "netsis";
}

/** Dolu bir hesap kodu ayrıştırıcıdan geçiyor mu (admin doğrulaması). */
export function isValidNetsisAccountingValue(
  key: string,
  value: string,
): boolean {
  return key === NETSIS_ACCOUNTING_SETTING_KEYS.enabled
    ? true
    : normalizeNetsisAccountCode(value) !== "";
}
