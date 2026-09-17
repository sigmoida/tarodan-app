import type { ConfigService } from "@nestjs/config";
import { PaytrMerchant } from "@prisma/client";
import { parsePaytrTestMode } from "../modules/payment-providers/paytr/paytr-test-mode.util";

/**
 * PayTR rapor senkronu bayrağı — TEK okuma noktası. Rapor uçları PayTR panelinde
 * ayrı yetki ister; bayrak kapalıyken ne senkron istek atar ne de mutabakat
 * ekranı "veri yok"u "senkron kapalı"dan ayırt edemez hâlde kalır.
 */
export function paytrReportSyncEnabled(config: ConfigService): boolean {
  return config.get<string>("PAYTR_REPORT_SYNC_ENABLED") === "true";
}

// =============================================================================
// PayTR MAĞAZA PROFİLLERİ
//
// İki PayTR mağazası var: pazaryeri (sipariş, takas, öne çıkarma, transfer) ve
// üyelik (ilk satın alma + oto-yenileme). PayTR non-3D yetkisini yalnız üyelik
// mağazasına verdi. Bir mağazanın kimliği, test modu, bildirim URL'i ve
// yetenekleri (kart saklama / kullanıcısız recurring) YALNIZ burada env'den
// okunur; imza PayTRCredentials'ta, kullanım yerleri profile bakar.
// =============================================================================

/** Mağazanın PayTR panelinde açılmış yetenekleri. */
export interface PaytrMerchantCapabilities {
  /** CAPI kart saklama (store_card / kayıtlı kartla 3D ödeme). */
  cardStorage: boolean;
  /** Kullanıcısız non-3D recurring çekim (oto-yenileme). Kart saklama şarttır. */
  recurring: boolean;
}

export interface PaytrMerchantConfig {
  merchant: PaytrMerchant;
  merchantId: string;
  merchantKey: string;
  merchantSalt: string;
  testMode: boolean;
  /** Panelde "Bildirim URL" olarak tanımlı olması gereken adres. */
  callbackUrl: string;
  capabilities: PaytrMerchantCapabilities;
}

/**
 * Mağaza başına PayTR bildirim yolu (global /api önekiyle). Her mağazanın
 * panelinde KENDİ yolu tanımlanır; hash o mağazanın anahtarıyla doğrulanır.
 */
export const PAYTR_CALLBACK_PATHS: Record<PaytrMerchant, string> = {
  [PaytrMerchant.marketplace]: "/api/payments/callback/paytr",
  [PaytrMerchant.membership]: "/api/payments/callback/paytr/membership",
};

/** Mağaza başına env anahtarları. Pazaryeri geriye uyum için eski adları korur. */
export const PAYTR_MERCHANT_ENV = {
  [PaytrMerchant.marketplace]: {
    merchantId: "PAYTR_MERCHANT_ID",
    merchantKey: "PAYTR_MERCHANT_KEY",
    merchantSalt: "PAYTR_MERCHANT_SALT",
    testMode: "PAYTR_TEST_MODE",
    callbackUrl: "PAYTR_CALLBACK_URL",
  },
  [PaytrMerchant.membership]: {
    merchantId: "PAYTR_MEMBERSHIP_MERCHANT_ID",
    merchantKey: "PAYTR_MEMBERSHIP_MERCHANT_KEY",
    merchantSalt: "PAYTR_MEMBERSHIP_MERCHANT_SALT",
    testMode: "PAYTR_MEMBERSHIP_TEST_MODE",
    callbackUrl: "PAYTR_MEMBERSHIP_CALLBACK_URL",
  },
} as const satisfies Record<
  PaytrMerchant,
  Record<
    "merchantId" | "merchantKey" | "merchantSalt" | "testMode" | "callbackUrl",
    string
  >
>;

const read = (config: ConfigService, key: string): string =>
  (config.get<string>(key) ?? "").trim();

const flag = (config: ConfigService, key: string): boolean =>
  read(config, key).toLowerCase() === "true";

/**
 * Yetenekler:
 *  - pazaryeri: kart saklama `PAYTR_CARD_STORAGE_ENABLED`; recurring HER ZAMAN
 *    kapalı — PayTR bu mağazaya non-3D vermedi, açılabilir bir bayrak olmamalı.
 *  - üyelik: kart saklama varsayılan AÇIK (`PAYTR_MEMBERSHIP_CARD_STORAGE_ENABLED=false`
 *    acil kapatma anahtarıdır); recurring `PAYTR_RECURRING_ENABLED` ve kart
 *    saklamaya bağlıdır (saklanmış kart olmadan kullanıcısız çekim olmaz).
 */
export function paytrMerchantCapabilities(
  config: ConfigService,
  merchant: PaytrMerchant,
): PaytrMerchantCapabilities {
  if (merchant === PaytrMerchant.membership) {
    const cardStorage =
      read(config, "PAYTR_MEMBERSHIP_CARD_STORAGE_ENABLED").toLowerCase() !==
      "false";
    return {
      cardStorage,
      recurring: cardStorage && flag(config, "PAYTR_RECURRING_ENABLED"),
    };
  }
  return {
    cardStorage: flag(config, "PAYTR_CARD_STORAGE_ENABLED"),
    recurring: false,
  };
}

export function paytrMerchantConfig(
  config: ConfigService,
  merchant: PaytrMerchant,
): PaytrMerchantConfig {
  const env = PAYTR_MERCHANT_ENV[merchant];
  const apiUrl = (
    config.get<string>("API_URL", "http://localhost:3001") || ""
  ).replace(/\/$/, "");
  return {
    merchant,
    merchantId: read(config, env.merchantId),
    merchantKey: read(config, env.merchantKey),
    merchantSalt: read(config, env.merchantSalt),
    testMode: parsePaytrTestMode(config.get<string>(env.testMode)),
    callbackUrl:
      read(config, env.callbackUrl) ||
      `${apiUrl}${PAYTR_CALLBACK_PATHS[merchant]}`,
    capabilities: paytrMerchantCapabilities(config, merchant),
  };
}

/**
 * Ödeme AMACI (istemcinin gördüğü sözlük) → mağaza. İstemci mağaza adını
 * bilmez; "sepet ödemesi" mi "üyelik" mi olduğunu bilir.
 */
export const PAYMENT_PURPOSES = ["checkout", "membership"] as const;
export type PaymentPurpose = (typeof PAYMENT_PURPOSES)[number];

export const PAYMENT_PURPOSE_MERCHANT: Record<PaymentPurpose, PaytrMerchant> = {
  checkout: PaytrMerchant.marketplace,
  membership: PaytrMerchant.membership,
};
