import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaytrMerchant } from "@prisma/client";
import * as crypto from "crypto";
import {
  paytrMerchantConfig,
  type PaytrMerchantCapabilities,
  type PaytrMerchantConfig,
} from "../../../config/paytr";

/**
 * Tek bir PayTR mağazasının kimliği ve İMZASI.
 *
 * PayTR'a giden her token ve gelen her bildirim hash'i buradan geçer: anahtar
 * (`merchantKey`) ve tuz (`merchantSalt`) bu sınıfın dışına çıkmaz. İki mağaza
 * olduğundan imza kopyalanırsa bir istemcinin yanlış mağazanın anahtarıyla
 * imzalaması an meselesiydi — PayTR bunu sessizce reddeder, bildirimde ise
 * sahte hash'i geçerli sayabilirdi.
 */
export class PaytrMerchantCredentials {
  constructor(private readonly config: PaytrMerchantConfig) {}

  get merchant(): PaytrMerchant {
    return this.config.merchant;
  }
  get merchantId(): string {
    return this.config.merchantId;
  }
  get testMode(): boolean {
    return this.config.testMode;
  }
  get callbackUrl(): string {
    return this.config.callbackUrl;
  }
  get capabilities(): PaytrMerchantCapabilities {
    return this.config.capabilities;
  }

  /** Kimlik, anahtar ve tuzun üçü de tanımlı mı. */
  get isConfigured(): boolean {
    return Boolean(
      this.config.merchantId &&
      this.config.merchantKey &&
      this.config.merchantSalt,
    );
  }

  /** base64(HMAC-SHA256(data, merchant_key)) — PayTR'ın tüm token'larının tabanı. */
  sign(data: string): string {
    return crypto
      .createHmac("sha256", this.config.merchantKey)
      .update(data)
      .digest("base64");
  }

  /**
   * PayTR token'larının neredeyse hepsi `...alanlar + merchant_salt` imzasıdır
   * (durum-sorgu, iade, Direkt API, CAPI, transfer, rapor).
   */
  signWithSalt(data: string): string {
    return this.sign(data + this.config.merchantSalt);
  }

  /** Sabit zamanlı karşılaştırma; uzunluk farkında erken false (timingSafeEqual throw eder). */
  private static safeEqual(expected: string, received: string): boolean {
    const a = Buffer.from(expected);
    const b = Buffer.from(received || "");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /** `data + merchant_salt` imzasını doğrular (ör. transfer sonucu bildirimi). */
  verifyWithSalt(data: string, hash: string): boolean {
    return PaytrMerchantCredentials.safeEqual(this.signWithSalt(data), hash);
  }

  /**
   * Ödeme bildirimi (Bildirim URL) hash'i. Tuz ORTADADIR:
   * merchant_oid + merchant_salt + status + total_amount.
   */
  signPaymentNotification(input: {
    merchantOid: string;
    status: string;
    totalAmount: string;
  }): string {
    return this.sign(
      `${input.merchantOid}${this.config.merchantSalt}${input.status}${input.totalAmount}`,
    );
  }

  verifyPaymentNotification(input: {
    merchantOid: string;
    status: string;
    totalAmount: string;
    hash: string;
  }): boolean {
    return PaytrMerchantCredentials.safeEqual(
      this.signPaymentNotification(input),
      input.hash,
    );
  }

  /** İki profil aynı PayTR mağazasını mı gösteriyor (yerel geliştirmede olabilir). */
  sameStoreAs(other: PaytrMerchantCredentials): boolean {
    return !!this.merchantId && this.merchantId === other.merchantId;
  }
}

/**
 * PayTR'a konuşan her istemcinin paylaştığı taban — mağaza profilleri, zaman
 * aşımı ve yanıt okuma.
 *
 * Zaman aşımı tek yerde: bir istemcide unutulursa PayTR yanıt vermediğinde
 * istek undici'nin ~300 saniyesine kadar askıda kalır (O1).
 */
@Injectable()
export class PayTRCredentials {
  private readonly logger = new Logger(PayTRCredentials.name);

  readonly baseUrl = "https://www.paytr.com/odeme";

  /**
   * O1: Tüm PayTR fetch'lerine uygulama-seviyesi HTTP timeout. (Retry,
   * çift-submit riski nedeniyle bilinçli eklenmedi.)
   */
  readonly httpTimeoutMs: number;

  private readonly merchants: Record<PaytrMerchant, PaytrMerchantCredentials>;

  constructor(private readonly configService: ConfigService) {
    this.httpTimeoutMs = parseInt(
      this.configService.get("PAYTR_HTTP_TIMEOUT_MS") || "20000",
      10,
    );
    this.merchants = {
      [PaytrMerchant.marketplace]: new PaytrMerchantCredentials(
        paytrMerchantConfig(this.configService, PaytrMerchant.marketplace),
      ),
      [PaytrMerchant.membership]: new PaytrMerchantCredentials(
        paytrMerchantConfig(this.configService, PaytrMerchant.membership),
      ),
    };
    for (const creds of Object.values(this.merchants)) {
      this.logStartup(creds);
    }
  }

  private logStartup(creds: PaytrMerchantCredentials): void {
    const label = `PayTR[${creds.merchant}]`;
    this.logger.log(
      `${label} callback (panel Bildirim URL): ${creds.callbackUrl}`,
    );
    if (creds.callbackUrl.includes("localhost")) {
      this.logger.warn(
        `${label} PayTR genelde localhost bildirim kabul etmez; ngrok + callback URL env'i kullanın, panelde aynı URL tanımlı olsun.`,
      );
    }
    if (!creds.isConfigured) {
      this.logger.warn(`⚠️ ${label} API credentials not configured`);
      return;
    }
    this.logger.log(
      `${label} test mode: ${creds.testMode ? "ON" : "OFF"} · cardStorage=${creds.capabilities.cardStorage} recurring=${creds.capabilities.recurring}`,
    );
  }

  /** Mağaza profili — her PayTR çağrısı hangi mağaza adına yapıldığını buradan alır. */
  forMerchant(
    merchant: PaytrMerchant = PaytrMerchant.marketplace,
  ): PaytrMerchantCredentials {
    return this.merchants[merchant];
  }

  /**
   * O2: PayTR yanıtını güvenli parse et. PayTR boş veya HTML (WAF/hata sayfası)
   * dönerse ham JSON.parse SyntaxError fırlatır; bunun yerine null döner.
   */
  parsePaytrJson<T = unknown>(rawText: string): T | null {
    if (!rawText?.trim()) return null;
    try {
      return JSON.parse(rawText) as T;
    } catch {
      return null;
    }
  }
}
