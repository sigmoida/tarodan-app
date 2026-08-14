import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { parsePaytrTestMode } from "./paytr-test-mode.util";

/**
 * PayTR'a konuşan her istemcinin paylaştığı taban — mağaza kimliği, imza ve
 * yanıt okuma. PayTRService'ten birebir taşındı.
 *
 * Tek bir yerde durmasının sebebi mekanik değil: imza anahtarı (`merchantKey`)
 * ve tuz (`merchantSalt`) kopyalandığında iki istemci farklı imza üretebilir ve
 * bu, PayTR tarafında sessizce reddedilen isteğe dönüşür. Zaman aşımı da
 * öyle — bir istemcide unutulursa PayTR yanıt vermediğinde istek undici'nin
 * ~300 saniyesine kadar askıda kalır (O1).
 */
@Injectable()
export class PayTRCredentials {
  private readonly logger = new Logger(PayTRCredentials.name);

  readonly merchantId: string;
  readonly merchantKey: string;
  readonly merchantSalt: string;
  readonly baseUrl: string;
  readonly testMode: boolean;

  /**
   * O1: Tüm PayTR fetch'lerine uygulama-seviyesi HTTP timeout. (Retry,
   * çift-submit riski nedeniyle bilinçli eklenmedi.)
   */
  readonly httpTimeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.merchantId = (
      this.configService.get("PAYTR_MERCHANT_ID", "") || ""
    ).trim();
    this.merchantKey = (
      this.configService.get("PAYTR_MERCHANT_KEY", "") || ""
    ).trim();
    this.merchantSalt = (
      this.configService.get("PAYTR_MERCHANT_SALT", "") || ""
    ).trim();
    this.baseUrl = "https://www.paytr.com/odeme";
    this.testMode = parsePaytrTestMode(
      this.configService.get("PAYTR_TEST_MODE"),
    );
    this.httpTimeoutMs = parseInt(
      this.configService.get("PAYTR_HTTP_TIMEOUT_MS") || "20000",
      10,
    );

    const customCallback = (
      this.configService.get("PAYTR_CALLBACK_URL", "") || ""
    ).trim();
    const apiUrl = (
      this.configService.get("API_URL", "http://localhost:3001") || ""
    ).replace(/\/$/, "");
    const effectiveCallback =
      customCallback || `${apiUrl}/api/payments/callback/paytr`;
    this.logger.log(
      `PayTR callback (panel Bildirim URL): ${effectiveCallback}`,
    );
    if (effectiveCallback.includes("localhost")) {
      this.logger.warn(
        "PayTR genelde localhost bildirim kabul etmez; ngrok ve PAYTR_CALLBACK_URL kullanın, panelde aynı URL tanımlı olsun.",
      );
    }

    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      this.logger.warn("⚠️ PayTR API credentials not configured");
    } else {
      this.logger.log(`PayTR test mode: ${this.testMode ? "ON" : "OFF"}`);
    }
  }

  /** HMAC-SHA256, Base64 (iade, bin-detay; iFrame get-token DEĞİL). */
  generateHash(data: string): string {
    return crypto
      .createHmac("sha256", this.merchantKey)
      .update(data)
      .digest("base64");
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
