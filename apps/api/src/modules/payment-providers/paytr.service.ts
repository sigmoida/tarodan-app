import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { i18nMessage } from "../i18n";
import type { IPaymentProvider } from "./payment-provider.interface";
import { PAYMENT_PROVIDER_PAYTR } from "./payment-provider.interface";
import {
  ProviderRefundOutcomeUnknownException,
  ProviderRefundRejectedException,
} from "./refund-errors";

// =============================================================================
// PAYTR API TYPES
// =============================================================================

export interface PayTRBuyer {
  name: string;
  surname: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  identityNumber?: string;
  ip: string;
}

export interface PayTRBasketItem {
  name: string;
  price: number; // TL; her PayTR endpoint'i kendi beklediği birime serialize eder.
  quantity: number;
}

export interface PayTRPaymentRequest {
  merchantOid: string;
  email: string;
  paymentAmount: number; // in kuruş
  paymentType: "card" | "eft";
  installmentCount: number;
  currency: "TL" | "EUR" | "USD" | "GBP" | "RUB";
  testMode: "0" | "1";
  noInstallment: "0" | "1";
  maxInstallment:
    "0" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12";
  userName: string;
  userAddress: string;
  userPhone: string;
  merchantOkUrl: string;
  merchantFailUrl: string;
  userBasket: string; // Base64 encoded JSON array
  debugOn: "0" | "1";
  lang: "tr" | "en";
  userIp: string;
  timeoutLimit?: string;
  cardType?: "bonus" | "axess" | "maximum" | "world" | "cardfinans" | "paraf";
  syncMode?: "0" | "1";
}

export interface PayTRIframeResponse {
  status: "success" | "failed";
  reason?: string;
  token?: string;
}

export interface PayTRCallbackData {
  merchant_oid: string;
  status: "success" | "failed";
  total_amount: string;
  hash: string;
  failed_reason_code?: string;
  failed_reason_msg?: string;
  test_mode?: string;
  payment_type?: string;
  currency?: string;
  payment_amount?: string;
  // Direkt API 2. adım (bildirim) dokümanı: PayTR taksit sayısını da bildirir.
  installment_count?: string;
}

export interface PayTRRefundRequest {
  merchantOid: string;
  returnAmount: number; // in kuruş
}

export interface PayTRRefundResponse {
  status: "success" | "error";
  err_no?: string;
  err_msg?: string;
  merchant_oid?: string;
  return_amount?: number;
}

/** PayTR durum-sorgu: başarılı yanıt (status === 'success') */
export type PayTRStatusInquirySuccess = {
  ok: true;
  /** Müşterinin ödediği tutar (TL), payment_total alanından */
  paymentTotalTl: number;
  /** Sipariş tutarı (TL), payment_amount */
  paymentAmountTl: number;
  paymentDate?: string;
  currency: string;
  /** Ödeme yöntemi (card/eft) — gözlemlenebilirlik/muhasebe için. */
  paymentType?: string;
  /** Taksit sayısı (0/1 = tek çekim). */
  installmentCount?: number;
  /** Ham PayTR durum-sorgu zarfı (denetim/mutabakat). PAN/CVV içermez. */
  raw?: Record<string, unknown>;
};

export type PayTRStatusInquiryResult =
  PayTRStatusInquirySuccess | { ok: false; errNo?: string; errMsg?: string };

/** PAYTR_TEST_MODE: true / 1 / yes → test */
export function parsePaytrTestMode(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") return true;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

// =============================================================================
// PAYTR SERVICE
// =============================================================================

@Injectable()
export class PayTRService implements IPaymentProvider {
  /** #89: provider key used by PaymentProviderRegistry (matches Payment.provider). */
  readonly key = PAYMENT_PROVIDER_PAYTR;
  private readonly logger = new Logger(PayTRService.name);
  private readonly merchantId: string;
  private readonly merchantKey: string;
  private readonly merchantSalt: string;
  private readonly baseUrl: string;
  private readonly testMode: boolean;

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

  // O1: Tüm PayTR fetch'lerine uygulama-seviyesi HTTP timeout. Aksi halde PayTR
  // yanıt vermezse istek undici varsayılan ~300s'ye kadar askıda kalıp kullanıcı
  // isteğini bloke eder. (Retry, çift-submit riski nedeniyle bilinçli eklenmedi.)
  private readonly httpTimeoutMs = parseInt(
    this.configService.get("PAYTR_HTTP_TIMEOUT_MS") || "20000",
    10,
  );

  /**
   * O2: PayTR yanıtını güvenli parse et. PayTR boş veya HTML (WAF/hata sayfası)
   * dönerse ham JSON.parse SyntaxError fırlatır; bunun yerine null döner.
   */
  private parsePaytrJson<T = any>(rawText: string): T | null {
    if (!rawText?.trim()) return null;
    try {
      return JSON.parse(rawText) as T;
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // STATUS INQUIRY (durum-sorgu) — callback kaçırılan başarılı ödemeler için
  // https://dev.paytr.com/en/durum-sorgu
  // ==========================================================================

  /**
   * PayTR merchant durum sorgu: merchant_oid için başarılı ödeme var mı ve tutarlar.
   * Token: base64(HMAC-SHA256(merchant_id + merchant_oid + merchant_salt, merchant_key))
   */
  async queryPaymentStatus(
    merchantOid: string,
  ): Promise<PayTRStatusInquiryResult> {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      this.logger.warn("PayTR status inquiry skipped: credentials missing");
      return { ok: false, errMsg: "PayTR not configured" };
    }
    if (!merchantOid?.trim()) {
      return { ok: false, errMsg: "merchant_oid required" };
    }

    const hashStr = this.merchantId + merchantOid + this.merchantSalt;
    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(hashStr)
      .digest("base64");

    const formData = new URLSearchParams({
      merchant_id: this.merchantId,
      merchant_oid: merchantOid,
      paytr_token: paytrToken,
    });

    try {
      const response = await fetch("https://www.paytr.com/odeme/durum-sorgu", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });

      const rawText = await response.text();
      if (!rawText?.trim()) {
        this.logger.error(
          `PayTR durum-sorgu boş yanıt HTTP ${response.status}`,
        );
        return { ok: false, errMsg: `Empty response HTTP ${response.status}` };
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        this.logger.error(
          `PayTR durum-sorgu JSON değil: ${rawText.slice(0, 200)}`,
        );
        return { ok: false, errMsg: "Invalid JSON from PayTR" };
      }

      const statusVal = (data.status ?? data.Status) as string | undefined;
      if (statusVal !== "success") {
        return {
          ok: false,
          errNo: data.err_no != null ? String(data.err_no) : undefined,
          errMsg: String(data.err_msg ?? "PayTR status inquiry failed"),
        };
      }

      const paymentTotalTl = PayTRService.parsePaytrMoneyString(
        (data.payment_total as string | undefined) ??
          (data.PaymentTotal as string | undefined),
      );
      const paymentAmountTl = PayTRService.parsePaytrMoneyString(
        (data.payment_amount as string | undefined) ??
          (data.PaymentAmount as string | undefined),
      );

      if (paymentTotalTl === null) {
        this.logger.warn(
          `PayTR durum-sorgu payment_total parse edilemedi: ${JSON.stringify(data)}`,
        );
        return { ok: false, errMsg: "Could not parse payment_total" };
      }
      const amountTl = paymentAmountTl ?? paymentTotalTl;

      const paymentDateRaw = data.payment_date ?? data.PaymentDate;
      const paymentDate =
        paymentDateRaw !== undefined && paymentDateRaw !== null
          ? String(paymentDateRaw)
          : undefined;

      const currency = String(data.currency ?? data.Currency ?? "TL");

      const paymentType =
        (data.payment_type as string | undefined) ??
        (data.PaymentType as string | undefined);
      const installmentRaw =
        (data.installment_count as string | number | undefined) ??
        (data.InstallmentCount as string | number | undefined);
      const installmentCount =
        installmentRaw != null && installmentRaw !== ""
          ? Number.parseInt(String(installmentRaw), 10)
          : undefined;

      return {
        ok: true,
        paymentTotalTl,
        paymentAmountTl: amountTl,
        paymentDate,
        currency,
        paymentType: paymentType != null ? String(paymentType) : undefined,
        installmentCount: Number.isFinite(installmentCount as number)
          ? installmentCount
          : undefined,
        raw: data,
      };
    } catch (error: any) {
      this.logger.error(`PayTR durum-sorgu hatası: ${error?.message}`);
      return {
        ok: false,
        errMsg: error?.message || "PayTR status inquiry error",
      };
    }
  }

  /** PayTR dökümanındaki gibi ondalık ayırıcı virgül olabilir (örn. "10,8") */
  static parsePaytrMoneyString(value: string | undefined): number | null {
    if (value === undefined || value === null) return null;
    const s = String(value).trim().replace(/\s/g, "").replace(",", ".");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  // ==========================================================================
  // CALLBACK VERIFICATION
  // ==========================================================================

  /**
   * Verify callback hash from PayTR
   */
  verifyCallback(callback: PayTRCallbackData): boolean {
    const hashStr = `${callback.merchant_oid}${this.merchantSalt}${callback.status}${callback.total_amount}`;
    const expectedHash = crypto
      .createHmac("sha256", this.merchantKey)
      .update(hashStr)
      .digest("base64");

    // Wave 4: sabit-zamanlı karşılaştırma (timing yan-kanalına karşı defense-in-depth).
    // timingSafeEqual eşit uzunluk ister → farklı uzunlukta erken false.
    const expected = Buffer.from(expectedHash);
    const received = Buffer.from(callback.hash || "");
    return (
      expected.length === received.length &&
      crypto.timingSafeEqual(expected, received)
    );
  }

  /**
   * Parse callback data
   */
  parseCallback(callback: PayTRCallbackData): {
    orderId: string;
    isSuccess: boolean;
    amount: number;
    errorCode?: string;
    errorMessage?: string;
    paymentType?: string;
    installmentCount?: number;
    currency?: string;
    /** Sipariş tutarı (payment_amount, TL) — total_amount'tan farklı olabilir. */
    paymentAmount?: number;
    testMode?: boolean;
  } {
    const installment =
      callback.installment_count != null && callback.installment_count !== ""
        ? parseInt(callback.installment_count, 10)
        : undefined;
    // Direkt API 2. adım (bildirim) dokümanı: CALLBACK'te payment_amount ×100 (KURUŞ)
    // gelir (örn. 34.56 TL → "3456"), total_amount ile AYNI birim. Kuruş → TL: /100.
    // DİKKAT: Step 1 İSTEĞİNDE payment_amount ondalık TL'dir ("100.99") — bu parse
    // yalnız callback içindir (createDirectPaymentForm'taki ondalık kural değişmez).
    const paymentAmountKurus =
      callback.payment_amount != null && callback.payment_amount !== ""
        ? parseInt(callback.payment_amount, 10)
        : undefined;
    const paymentAmount =
      paymentAmountKurus != null && Number.isFinite(paymentAmountKurus)
        ? paymentAmountKurus / 100
        : undefined;
    return {
      orderId: callback.merchant_oid,
      isSuccess: callback.status === "success",
      amount: parseInt(callback.total_amount, 10) / 100, // Convert from kuruş to TL
      errorCode: callback.failed_reason_code,
      errorMessage: callback.failed_reason_msg,
      paymentType: callback.payment_type,
      installmentCount: Number.isFinite(installment as number)
        ? installment
        : undefined,
      currency: callback.currency,
      paymentAmount,
      testMode: callback.test_mode === "1",
    };
  }

  // ==========================================================================
  // REFUND
  // ==========================================================================

  /**
   * Create refund request
   */
  async createRefund(
    merchantOid: string,
    amount: number, // in TL
  ): Promise<PayTRRefundResponse> {
    const oid = merchantOid.includes("-")
      ? merchantOid.replace(/-/g, "")
      : merchantOid;
    // ÖNEMLİ: PayTR İade API return_amount = ONDALIK TL ("10.25"), KURUŞ DEĞİL.
    // Resmi İade doc: "Ayraç olarak yalnızca bir nokta (.) gönderilmelidir. Örnek: 10.25".
    // Kuruş (×100) göndermek 100 KAT fazla iadeye = maddi kayba yol açar (createDirectPaymentForm
    // ile aynı /odeme birim kuralı). Hash de aynı string ile üretilir.
    const returnAmount = amount.toFixed(2); // ONDALIK TL

    // Build hash for refund
    const hashStr = `${this.merchantId}${oid}${returnAmount}${this.merchantSalt}`;
    const paytrToken = this.generateHash(hashStr);

    const formData = new URLSearchParams({
      merchant_id: this.merchantId,
      merchant_oid: oid,
      return_amount: returnAmount,
      paytr_token: paytrToken,
    });

    try {
      const response = await fetch("https://www.paytr.com/odeme/iade", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });

      const rawText = await response.text();
      const data = this.parsePaytrJson<PayTRRefundResponse>(rawText);
      if (!data) {
        throw new ProviderRefundOutcomeUnknownException(
          i18nMessage("server.payment.refundResponseInvalid"),
        );
      }

      if (data.status !== "success") {
        throw new ProviderRefundRejectedException(
          data.err_msg || i18nMessage("server.payment.refundFailed"),
        );
      }

      return data;
    } catch (error: any) {
      this.logger.error("PayTR refund error:", error);
      if (
        error instanceof ProviderRefundRejectedException ||
        error instanceof ProviderRefundOutcomeUnknownException
      ) {
        throw error;
      }
      throw new ProviderRefundOutcomeUnknownException(
        i18nMessage("server.payment.refundError"),
      );
    }
  }

  /**
   * Create partial refund
   */
  async createPartialRefund(
    merchantOid: string,
    amount: number, // in TL
  ): Promise<PayTRRefundResponse> {
    return this.createRefund(merchantOid, amount);
  }

  // ==========================================================================
  // BIN LOOKUP + INSTALLMENT RATES
  // https://dev.paytr.com/en/direkt-api/bin-sorgulama-servisi
  // https://dev.paytr.com/en/direkt-api/taksit-sorgulama
  // ==========================================================================

  /**
   * BIN sorgulama: kartın ilk 6/8 hanesinden banka/şema/tip bilgisini döndürür.
   * Dokümana göre endpoint /odeme/api/bin-detail; hash_str = bin_number + merchant_id
   * + merchant_salt (HMAC key = merchant_key). PAN saklanmaz — yalnız BIN gönderilir.
   *
   * DÜZELTME: Eski getInstallmentOptions bu endpoint'i (a) YANLIŞ hash sırasıyla
   * (merchant_id + bin + amount + salt) ve (b) YANLIŞ yanıt şemasıyla (taksit1..12 —
   * bin-detail taksit tablosu DÖNDÜRMEZ; o /odeme/taksit-oranlari'dır) çağırıyordu.
   */
  async lookupBin(binNumber: string): Promise<{
    ok: boolean;
    bank?: string;
    bankCode?: number;
    schema?: string; // VISA | MASTERCARD | AMEX | TROY | OTHER
    cardType?: string; // credit | debit
    brand?: string; // axess | bonus | ... | none
    businessCard?: boolean;
    allowNon3d?: boolean;
    errMsg?: string;
  }> {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      return { ok: false, errMsg: "PayTR not configured" };
    }
    const bin = (binNumber || "").replace(/\D/g, "").slice(0, 8);
    if (bin.length < 6) return { ok: false, errMsg: "bin_number too short" };

    // Doküman: hash_str = bin_number + merchant_id + merchant_salt
    const paytrToken = this.generateHash(
      bin + this.merchantId + this.merchantSalt,
    );
    const form = new URLSearchParams({
      merchant_id: this.merchantId,
      bin_number: bin,
      paytr_token: paytrToken,
    });
    try {
      const response = await fetch(
        "https://www.paytr.com/odeme/api/bin-detail",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
          signal: AbortSignal.timeout(this.httpTimeoutMs),
        },
      );
      const data = this.parsePaytrJson<any>(await response.text());
      if (!data || data.status !== "success") {
        return { ok: false, errMsg: data?.err_msg || "BIN lookup failed" };
      }
      return {
        ok: true,
        bank: data.bank != null ? String(data.bank) : undefined,
        bankCode: Number.isFinite(Number(data.bankCode))
          ? Number(data.bankCode)
          : undefined,
        schema: data.schema != null ? String(data.schema) : undefined,
        cardType: data.cardType != null ? String(data.cardType) : undefined,
        brand: data.brand != null ? String(data.brand) : undefined,
        businessCard:
          data.businessCard != null
            ? String(data.businessCard).toLowerCase() === "y"
            : undefined,
        allowNon3d:
          data.allow_non3d != null
            ? String(data.allow_non3d).toLowerCase() === "y"
            : undefined,
      };
    } catch (error: any) {
      this.logger.error(`PayTR BIN lookup hata: ${error?.message}`);
      return { ok: false, errMsg: error?.message || "BIN lookup error" };
    }
  }

  /**
   * Taksit oranları: mağazanın kart-tipi bazlı taksit oran tablosunu döndürür.
   * Dokümana göre endpoint /odeme/taksit-oranlari (bin-detail DEĞİL); hash_str =
   * merchant_id + request_id + merchant_salt (HMAC key = merchant_key). request_id
   * ≤ 32 karakter; çağıran benzersiz bir değer üretmeli.
   */
  async getInstallmentRates(
    requestId: string,
    options?: { singleRatio?: boolean; abroadRatio?: boolean },
  ): Promise<{
    ok: boolean;
    requestId?: string;
    maxInstallment?: number;
    rates?: Record<string, unknown>;
    errMsg?: string;
  }> {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      return { ok: false, errMsg: "PayTR not configured" };
    }
    const reqId = (requestId || "").slice(0, 32);
    // Doküman: hash_str = merchant_id + request_id + merchant_salt
    const paytrToken = this.generateHash(
      this.merchantId + reqId + this.merchantSalt,
    );
    const form = new URLSearchParams({
      merchant_id: this.merchantId,
      request_id: reqId,
      paytr_token: paytrToken,
    });
    if (options?.singleRatio) form.set("single_ratio", "1");
    if (options?.abroadRatio) form.set("abroad_ratio", "1");
    try {
      const response = await fetch(
        "https://www.paytr.com/odeme/taksit-oranlari",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString(),
          signal: AbortSignal.timeout(this.httpTimeoutMs),
        },
      );
      const data = this.parsePaytrJson<any>(await response.text());
      if (!data || data.status !== "success") {
        return {
          ok: false,
          errMsg: data?.err_msg || "Installment rates unavailable",
        };
      }
      return {
        ok: true,
        requestId: data.request_id != null ? String(data.request_id) : reqId,
        maxInstallment: Number.isFinite(Number(data.max_inst_non_bus))
          ? Number(data.max_inst_non_bus)
          : undefined,
        rates: (data.rates as Record<string, unknown>) ?? undefined,
      };
    } catch (error: any) {
      this.logger.error(`PayTR taksit-oranları hata: ${error?.message}`);
      return { ok: false, errMsg: error?.message || "Installment rates error" };
    }
  }

  // ==========================================================================
  // DIRECT API PAYMENT (Alternative to iframe)
  // https://dev.paytr.com/direkt-api
  // ==========================================================================

  /**
   * PayTR Direct API formunu hazırlar. Kart numarası, son kullanma ve CVV bu
   * metoda gelmez: PayTR sözleşmesi gereği tarayıcı bu alanları doğrudan
   * https://www.paytr.com/odeme adresine POST eder.
   */
  async createDirectPaymentForm(
    merchantOid: string,
    amount: number, // TL
    buyer: PayTRBuyer,
    basketItems: PayTRBasketItem[],
    options?: {
      installmentCount?: number;
      /** e.g. "paymentId=...&type=membership" — success sayfası verify için kullanır */
      successQueryParams?: string;
      /** CAPI: kartı PayTR'da sakla → callback'te utoken döner. */
      storeCard?: boolean;
      /** Kullanıcının zaten bir utoken'ı varsa yeni kart eklerken birlikte gönderilir. */
      utoken?: string;
      /** Kullanıcıya ait kayıtlı kart ile kullanıcı-mevcut (CIT) ödeme. */
      savedCard?: {
        utoken: string;
        ctoken: string;
        requireCvv: boolean;
      };
    },
  ): Promise<{
    action: string;
    method: "POST";
    fields: Array<{ name: string; value: string }>;
    requireCvv: boolean;
  }> {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException(
        i18nMessage("server.payment.notConfigured"),
      );
    }

    // ÖNEMLİ: Direkt API /odeme payment_amount = ONDALIK TL ("462.81"), KURUŞ DEĞİL.
    // Resmi PayTR Direkt API örnek kodu: payment_amount = '100.99'. Kuruş (×100) göndermek
    // PayTR'nin 100 KATI tutar çekmesine yol açar (panelde "46.281,00 TL", callback total_amount
    // ×100). chargeRecurring de aynı /odeme'yi ONDALIK TL ile çağırır — tutarlı.
    const paymentAmountStr = amount.toFixed(2); // ONDALIK TL
    const paymentType = "card";
    // Tek çekim için '0' gönderilir (Direkt API kuralı)
    const installmentCount = String(
      options?.installmentCount && options.installmentCount > 1
        ? options.installmentCount
        : 0,
    );
    const currency = "TL";
    const testModeStr = this.testMode ? "1" : "0";
    // Kullanıcının başlattığı checkout her zaman 3D Secure'dur. Non3D yalnız
    // ayrı recurring akışında, açık mağaza yetkisiyle sunucudan kullanılır.
    const non3d = "0";

    const successBase = `${this.configService.get("FRONTEND_URL")}/payment/success`;
    const merchantOkUrl = options?.successQueryParams
      ? `${successBase}?${options.successQueryParams}`
      : successBase;
    const merchantFailUrl = `${this.configService.get("FRONTEND_URL")}/payment/fail`;

    // Direkt API token:
    // hashStr = merchant_id + user_ip + merchant_oid + email + payment_amount
    //           + payment_type + installment_count + currency + test_mode + non_3d
    const hashStr =
      this.merchantId +
      buyer.ip +
      merchantOid +
      buyer.email +
      paymentAmountStr +
      paymentType +
      installmentCount +
      currency +
      testModeStr +
      non3d;
    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(hashStr + this.merchantSalt)
      .digest("base64");

    // Direkt API basket: ONDALIK TL birim fiyat ("50.00") — resmi örnek kodla birebir
    // (payment_amount ile aynı birim). Kuruş GÖNDERME (×100 hatasına yol açar).
    const userBasket = JSON.stringify(
      basketItems.map((item) => [
        item.name,
        Number(item.price).toFixed(2),
        item.quantity,
      ]),
    );

    // request_exp_date bilinçli gönderilmiyor: PayTR Direct API, Unix epoch
    // değerini geçersiz token olarak reddediyor; alan yoksa 30 dakika kullanıyor.
    const formData = new URLSearchParams({
      merchant_id: this.merchantId,
      user_ip: buyer.ip,
      merchant_oid: merchantOid,
      email: buyer.email,
      payment_amount: paymentAmountStr,
      payment_type: paymentType,
      installment_count: installmentCount,
      currency,
      test_mode: testModeStr,
      non_3d: non3d,
      paytr_token: paytrToken,
      merchant_ok_url: merchantOkUrl,
      merchant_fail_url: merchantFailUrl,
      user_name: `${buyer.name} ${buyer.surname}`.trim(),
      user_address: buyer.address,
      user_phone: buyer.phone,
      user_basket: userBasket,
      debug_on: this.testMode ? "1" : "0",
      client_lang: "tr",
    });

    if (options?.savedCard) {
      formData.set("utoken", options.savedCard.utoken);
      formData.set("ctoken", options.savedCard.ctoken);
      formData.set("require_cvv", options.savedCard.requireCvv ? "1" : "0");
    } else {
      // CAPI kart saklama: store_card=1 → callback'te utoken döner. Mevcut
      // utoken gönderilirse yeni kart aynı PayTR kullanıcısı altında gruplanır.
      if (options?.storeCard) formData.set("store_card", "1");
      if (options?.utoken) formData.set("utoken", options.utoken);
    }

    return {
      action: this.baseUrl,
      method: "POST",
      // Dizi biçimi, global response sanitizer'ın token alan adlarını nesne
      // anahtarı sanıp silmesini engeller; endpoint sahiplik/capability kontrollüdür.
      fields: [...formData.entries()].map(([name, value]) => ({ name, value })),
      requireCvv: options?.savedCard?.requireCvv ?? false,
    };
  }

  // ==========================================================================
  // CAPI — KART SAKLAMA / RECURRING (kullanıcısız tekrarlayan ödeme)
  // Kaynak: resmi PayTR "Kart Saklama (CAPI) + Recurring" dokümanı + NODEJS örnek kodu.
  // UYARI: Kart saklama PAYTR_CARD_STORAGE_ENABLED; kullanıcısız Non3D çekim
  // ayrıca PAYTR_RECURRING_ENABLED ile açılır. İki PayTR yetkisini karıştırmayın.
  // ==========================================================================

  /**
   * Kayıtlı kartla ÖDEME (Payment By Registered Card) — kullanıcı MEVCUT (CIT).
   * Recurring'den farkı: `recurring_payment` GÖNDERİLMEZ (bu merchant-initiated bir
   * tekrarlayan çekim değil, kullanıcının o an başlattığı işlemdir) ve `require_cvv`/
   * `cvv` desteklenir. Hash Direkt API ile BİREBİR aynıdır (mid + ip + oid + email +
   * amount + payment_type + installment + currency + test_mode + non_3d, salt update
   * içinde). payment_amount ONDALIK TL. non3d=false → 3DS HTML döner (Direct API
   * gibi, kullanıcıya gösterilir); non3d=true → JSON status (success|failed|wait_callback),
   * kesin sonuç ayrıca Bildirim URL'ine düşer. Kaynak: PayTR "kayıtlı karttan ödeme" dok.
   */
  async capiPaymentByRegisteredCard(params: {
    utoken: string;
    ctoken: string;
    amount: number; // TL
    merchantOid: string;
    buyer: PayTRBuyer;
    basketItems: PayTRBasketItem[];
    requireCvv?: boolean;
    cvv?: string;
    installmentCount?: number;
    /** Varsayılan true → mevcut senkron Non3D davranışını korur. */
    non3d?: boolean;
    successQueryParams?: string;
  }): Promise<{
    status: "success" | "failed" | "wait_callback";
    reason?: string;
    tryAgain?: boolean;
    /** Yalnız non3d=false'ta dolu — 3DS banka formu HTML'i. */
    threeDSHtml?: string;
    /** Ham PayTR yanıtı (gözlemlenebilirlik/mutabakat). PAN/CVV içermez. */
    raw?: Record<string, unknown>;
  }> {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException(
        i18nMessage("server.payment.notConfigured"),
      );
    }
    const paymentAmount = params.amount.toFixed(2); // ONDALIK TL
    const paymentType = "card";
    const installmentCount = String(
      params.installmentCount && params.installmentCount > 1
        ? params.installmentCount
        : 0,
    );
    const currency = "TL";
    const testModeStr = this.testMode ? "1" : "0";
    const non3d = params.non3d === false ? "0" : "1";

    const successBase = `${this.configService.get("FRONTEND_URL")}/payment/success`;
    const merchantOkUrl = params.successQueryParams
      ? `${successBase}?${params.successQueryParams}`
      : successBase;
    const merchantFailUrl = `${this.configService.get("FRONTEND_URL")}/payment/fail`;

    // hashStr = mid + ip + oid + email + amount + payment_type + installment + currency + test_mode + non_3d
    const hashStr =
      this.merchantId +
      params.buyer.ip +
      params.merchantOid +
      params.buyer.email +
      paymentAmount +
      paymentType +
      installmentCount +
      currency +
      testModeStr +
      non3d;
    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(hashStr + this.merchantSalt)
      .digest("base64");

    const userBasket = JSON.stringify(
      params.basketItems.map((i) => [
        i.name,
        Number(i.price).toFixed(2),
        i.quantity,
      ]),
    );

    const form = new URLSearchParams({
      merchant_id: this.merchantId,
      user_ip: params.buyer.ip,
      merchant_oid: params.merchantOid,
      email: params.buyer.email,
      payment_type: paymentType,
      payment_amount: paymentAmount,
      installment_count: installmentCount,
      currency,
      test_mode: testModeStr,
      non_3d: non3d,
      merchant_ok_url: merchantOkUrl,
      merchant_fail_url: merchantFailUrl,
      user_name: `${params.buyer.name} ${params.buyer.surname}`.trim(),
      user_address: params.buyer.address,
      user_phone: params.buyer.phone,
      user_basket: userBasket,
      debug_on: this.testMode ? "1" : "0",
      client_lang: "tr",
      utoken: params.utoken,
      ctoken: params.ctoken,
      // Doküman: kayıtlı karttan ödemede require_cvv zorunlu alandır (1/0).
      require_cvv: params.requireCvv ? "1" : "0",
      paytr_token: paytrToken,
    });
    if (params.cvv) form.set("cvv", params.cvv);

    let rawText: string;
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
      rawText = await response.text();
    } catch (error: any) {
      this.logger.error(
        `PayTR kayıtlı-kart ödeme hata oid=${params.merchantOid}: ${error?.message}`,
      );
      return {
        status: "failed",
        reason: error?.message || "bağlantı hatası",
        tryAgain: true,
      };
    }

    const trimmed = (rawText || "").trim();
    // 3DS akışı (non3d=false): banka formunu içeren HTML → istemciye göster.
    if (non3d === "0") {
      const lower = trimmed.slice(0, 500).toLowerCase();
      if (
        lower.includes("<html") ||
        lower.includes("<!doctype") ||
        lower.includes("<form")
      ) {
        return { status: "success", threeDSHtml: rawText };
      }
    }
    // Non3D / hata: JSON yanıt (status ∈ success | failed | wait_callback).
    const data = this.parsePaytrJson<{
      status?: string;
      reason?: string;
      err_msg?: string;
      try_again?: boolean;
      [k: string]: unknown;
    }>(trimmed);
    if (!data || !data.status) {
      this.logger.error(
        `PayTR kayıtlı-kart ödeme boş/geçersiz yanıt oid=${params.merchantOid}: ${trimmed.slice(0, 200)}`,
      );
      return {
        status: "failed",
        reason: "PayTR geçersiz/boş yanıt",
        tryAgain: true,
      };
    }
    return {
      status: data.status as "success" | "failed" | "wait_callback",
      reason: data.reason || data.err_msg,
      tryAgain: data.try_again,
      raw: data,
    };
  }

  /**
   * Kayıtlı kartla KULLANICISIZ tekrarlayan ödeme (RECURRING).
   * POST {baseUrl} (/odeme) recurring_payment=1 + non_3d=1. Hash, Direkt API deseniyle
   * BİREBİR aynıdır (recurring örnek kodundan doğrulandı). payment_amount ONDALIK TL
   * ("100.99") — kuruş DEĞİL. Yanıt JSON: status ∈ success | failed | wait_callback;
   * failed'de try_again ile dunning yönetilir. (Detay ayrıca Bildirim URL'ine de düşer.)
   */
  async chargeRecurring(params: {
    utoken: string;
    ctoken: string;
    amount: number; // TL
    merchantOid: string;
    buyer: PayTRBuyer;
    basketItems: PayTRBasketItem[];
    cvv?: string;
  }): Promise<{
    status: "success" | "failed" | "wait_callback";
    reason?: string;
    tryAgain?: boolean;
    /** Ham PayTR recurring yanıtı (gözlemlenebilirlik/mutabakat). PAN/CVV içermez. */
    raw?: Record<string, unknown>;
  }> {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException(
        i18nMessage("server.payment.notConfigured"),
      );
    }
    const paymentAmount = params.amount.toFixed(2); // ONDALIK TL (recurring kuruş kabul etmez)
    const paymentType = "card";
    const installmentCount = "0";
    const currency = "TL";
    const testModeStr = this.testMode ? "1" : "0";
    const non3d = "1";

    // hashStr = mid + ip + oid + email + amount + payment_type + installment + currency + test_mode + non_3d
    const hashStr =
      this.merchantId +
      params.buyer.ip +
      params.merchantOid +
      params.buyer.email +
      paymentAmount +
      paymentType +
      installmentCount +
      currency +
      testModeStr +
      non3d;
    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(hashStr + this.merchantSalt)
      .digest("base64");

    // Recurring sepeti: düz JSON, ondalık fiyat (örnek kodla uyumlu — iframe base64'ünden farklı)
    const userBasket = JSON.stringify(
      params.basketItems.map((i) => [
        i.name,
        Number(i.price).toFixed(2),
        i.quantity,
      ]),
    );

    const form = new URLSearchParams({
      merchant_id: this.merchantId,
      user_ip: params.buyer.ip,
      merchant_oid: params.merchantOid,
      email: params.buyer.email,
      payment_type: paymentType,
      payment_amount: paymentAmount,
      currency,
      test_mode: testModeStr,
      non_3d: non3d,
      merchant_ok_url: `${this.configService.get("FRONTEND_URL")}/payment/success`,
      merchant_fail_url: `${this.configService.get("FRONTEND_URL")}/payment/fail`,
      user_name: `${params.buyer.name} ${params.buyer.surname}`,
      user_address: params.buyer.address,
      user_phone: params.buyer.phone,
      user_basket: userBasket,
      debug_on: this.testMode ? "1" : "0",
      client_lang: "tr",
      installment_count: installmentCount,
      utoken: params.utoken,
      ctoken: params.ctoken,
      recurring_payment: "1",
      paytr_token: paytrToken,
    });
    if (params.cvv) form.set("cvv", params.cvv);

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
      const rawText = await response.text();
      const data = this.parsePaytrJson<{
        status?: string;
        reason?: string;
        err_msg?: string;
        try_again?: boolean;
        [k: string]: unknown;
      }>(rawText);
      if (!data || !data.status) {
        this.logger.error(
          `PayTR recurring boş/geçersiz yanıt oid=${params.merchantOid}: ${rawText?.slice(0, 200)}`,
        );
        return {
          status: "failed",
          reason: "PayTR geçersiz/boş yanıt",
          tryAgain: true,
        };
      }
      return {
        status: data.status as "success" | "failed" | "wait_callback",
        reason: data.reason || data.err_msg,
        tryAgain: data.try_again,
        raw: data,
      };
    } catch (error: any) {
      this.logger.error(
        `PayTR recurring hata oid=${params.merchantOid}: ${error?.message}`,
      );
      // Ağ/timeout → geçici kabul et, tekrar denenebilir.
      return {
        status: "failed",
        reason: error?.message || "bağlantı hatası",
        tryAgain: true,
      };
    }
  }

  /**
   * Kullanıcının PayTR'da kayıtlı kartlarını listeler (utoken → ctoken + maskeli bilgi).
   * Hash = HMAC(merchant_key, utoken + merchant_salt) (örnek koddan).
   */
  async capiListCards(utoken: string): Promise<
    Array<{
      ctoken: string;
      last4: string;
      requireCvv: boolean;
      month?: string;
      year?: string;
      brand?: string;
      type?: string;
      schema?: string;
      /** PayTR c_bank — kartı çıkaran banka. */
      bank?: string;
      /** PayTR businessCard (y/n) → kurumsal kart mı. */
      businessCard?: boolean;
    }>
  > {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException(
        i18nMessage("server.payment.notConfigured"),
      );
    }
    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(utoken + this.merchantSalt)
      .digest("base64");
    const form = new URLSearchParams({
      merchant_id: this.merchantId,
      utoken,
      paytr_token: paytrToken,
    });
    try {
      const response = await fetch("https://www.paytr.com/odeme/capi/list", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
      const rawText = await response.text();
      const data = this.parsePaytrJson<any>(rawText);
      // Hata: {status:'error', err_msg}. Eşleşme yoksa boş JSON. Başarı: kart dizisi.
      if (!data || data.status === "error") {
        if (data?.status === "error")
          this.logger.warn(`PayTR capi/list error: ${data.err_msg}`);
        return [];
      }
      const cards = Array.isArray(data)
        ? data
        : Array.isArray(data.cards)
          ? data.cards
          : [];
      return cards
        .map((c: any) => ({
          ctoken: c.ctoken,
          last4: c.last_4,
          requireCvv: String(c.require_cvv) === "1",
          month: c.month,
          year: c.year,
          brand: c.c_brand,
          type: c.c_type,
          schema: c.schema,
          bank: c.c_bank,
          businessCard:
            c.businessCard != null
              ? String(c.businessCard).toLowerCase() === "y"
              : undefined,
        }))
        .filter((c: any) => !!c.ctoken);
    } catch (error: any) {
      this.logger.error(`PayTR capi/list hata: ${error?.message}`);
      return [];
    }
  }

  /**
   * Kullanıcının kayıtlı bir kartını siler.
   * Hash = HMAC(merchant_key, ctoken + utoken + merchant_salt) (örnek koddan).
   */
  async capiDeleteCard(
    utoken: string,
    ctoken: string,
  ): Promise<{ status: string; reason?: string }> {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException(
        i18nMessage("server.payment.notConfigured"),
      );
    }
    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(ctoken + utoken + this.merchantSalt)
      .digest("base64");
    const form = new URLSearchParams({
      merchant_id: this.merchantId,
      ctoken,
      utoken,
      paytr_token: paytrToken,
    });
    try {
      const response = await fetch("https://www.paytr.com/odeme/capi/delete", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
      const rawText = await response.text();
      const data = this.parsePaytrJson<{ status?: string; err_msg?: string }>(
        rawText,
      );
      return { status: data?.status || "error", reason: data?.err_msg };
    } catch (error: any) {
      this.logger.error(`PayTR capi/delete hata: ${error?.message}`);
      return { status: "error", reason: error?.message };
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Generate HMAC-SHA256 hash in Base64 (refund, bin-detail; not iFrame get-token)
   */
  private generateHash(data: string): string {
    return crypto
      .createHmac("sha256", this.merchantKey)
      .update(data)
      .digest("base64");
  }

  // ==========================================================================
  // PLATFORM TRANSFER (Seller Payout)
  // ==========================================================================

  /**
   * Transfer funds to seller's IBAN via PayTR Platform Transfer API.
   * Requires a previously completed payment (merchant_oid must match).
   */
  async createPlatformTransfer(params: {
    merchantOid: string;
    transId: string;
    submerchantAmount: number;
    totalAmount: number;
    transferName: string;
    transferIban: string;
  }): Promise<{ status: string; err_no?: string; err_msg?: string }> {
    const submerchantAmountKurus = Math.round(
      params.submerchantAmount * 100,
    ).toString();
    const totalAmountKurus = Math.round(params.totalAmount * 100).toString();
    const oid = params.merchantOid.replace(/-/g, "");

    const hashStr =
      this.merchantId +
      oid +
      params.transId +
      submerchantAmountKurus +
      totalAmountKurus +
      params.transferName +
      params.transferIban +
      this.merchantSalt;

    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(hashStr)
      .digest("base64");

    const postData = new URLSearchParams({
      merchant_id: this.merchantId,
      merchant_oid: oid,
      trans_id: params.transId,
      submerchant_amount: submerchantAmountKurus,
      total_amount: totalAmountKurus,
      transfer_name: params.transferName,
      transfer_iban: params.transferIban,
      paytr_token: paytrToken,
    }).toString();

    try {
      const response = await fetch(`${this.baseUrl}/platform/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: postData,
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
      const rawText = await response.text();
      const parsed = this.parsePaytrJson<{
        status: string;
        err_no?: string;
        err_msg?: string;
      }>(rawText) ?? {
        status: "failed",
        err_msg: "PayTR geçersiz/boş yanıt",
      };
      this.logger.log(
        `Platform transfer ${params.transId}: status=${parsed.status}${parsed.err_msg ? ` err=${parsed.err_msg}` : ""}`,
      );
      return parsed;
    } catch (error: any) {
      this.logger.error(
        `Platform transfer failed for ${params.transId}: ${error.message}`,
      );
      throw new BadRequestException(
        `PayTR platform transfer başarısız: ${error.message}`,
      );
    }
  }

  /**
   * Aşama-2: platform transfer SONUCU callback'inin hash doğrulaması.
   * Doküman: hash = base64(HMAC-SHA256(trans_ids + merchant_salt, merchant_key)).
   *
   * DİKKAT: `transIds` HAM gövde string'idir — JSON parse edilip yeniden
   * serialize edilirse boşluk/kaçış farkından hash tutmaz. Doğrulama ham
   * string üzerinden yapılır; parse işi çağırana aittir.
   */
  verifyTransferCallback(params: { transIds: string; hash: string }): boolean {
    if (!params.transIds || !params.hash) return false;
    const expected = crypto
      .createHmac("sha256", this.merchantKey)
      .update(params.transIds + this.merchantSalt)
      .digest("base64");
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(params.hash);
    // timingSafeEqual uzunluk farkında throw eder — kısa/sahte hash 500 üretmesin.
    if (expectedBuf.length !== receivedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  }

  /**
   * Query returned (failed) transfers within a date range.
   */
  async getReturnedTransfers(params: {
    startDate: string;
    endDate: string;
  }): Promise<any> {
    const hashStr =
      this.merchantId + params.startDate + params.endDate + this.merchantSalt;

    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(hashStr)
      .digest("base64");

    const postData = new URLSearchParams({
      merchant_id: this.merchantId,
      start_date: params.startDate,
      end_date: params.endDate,
      paytr_token: paytrToken,
    }).toString();

    try {
      const response = await fetch(
        "https://www.paytr.com/odeme/geri-donen-transfer",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: postData,
          signal: AbortSignal.timeout(this.httpTimeoutMs),
        },
      );
      const rawText = await response.text();
      return this.parsePaytrJson(rawText) ?? { status: "failed" };
    } catch (error: any) {
      this.logger.error(`Get returned transfers failed: ${error.message}`);
      throw new BadRequestException(
        `PayTR geri dönen transfer sorgusu başarısız: ${error.message}`,
      );
    }
  }

  /**
   * Resend returned transfers from account balance.
   */
  async resendReturnedTransfers(params: {
    transId: string;
    transfers: Array<{ amount: number; receiver: string; iban: string }>;
  }): Promise<any> {
    const hashStr = this.merchantId + params.transId + this.merchantSalt;

    const paytrToken = crypto
      .createHmac("sha256", this.merchantKey)
      .update(hashStr)
      .digest("base64");

    const transInfo = params.transfers.map((t) => ({
      amount: Math.round(t.amount * 100).toString(),
      receiver: t.receiver,
      iban: t.iban,
    }));

    const postData = new URLSearchParams({
      merchant_id: this.merchantId,
      trans_id: params.transId,
      trans_info: JSON.stringify(transInfo),
      paytr_token: paytrToken,
    }).toString();

    try {
      const response = await fetch(
        "https://www.paytr.com/odeme/hesaptan-gonder",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: postData,
          signal: AbortSignal.timeout(this.httpTimeoutMs),
        },
      );
      const rawText = await response.text();
      return this.parsePaytrJson(rawText) ?? { status: "failed" };
    } catch (error: any) {
      this.logger.error(`Resend returned transfers failed: ${error.message}`);
      throw new BadRequestException(
        `PayTR hesaptan gönder başarısız: ${error.message}`,
      );
    }
  }
}
