import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { i18nMessage } from "../../i18n";
import type { IPaymentProvider } from "../payment-provider.interface";
import { PAYMENT_PROVIDER_PAYTR } from "../payment-provider.interface";
import {
  ProviderRefundOutcomeUnknownException,
  ProviderRefundRejectedException,
} from "../refund-errors";

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

export interface PayTRRefundResponse {
  status: "success" | "error";
  err_no?: string;
  err_msg?: string;
  merchant_oid?: string;
  return_amount?: number;
  /** İstekte gönderildiyse PayTR aynen geri döner (durum-sorgu eşlemesi için). */
  reference_no?: string;
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
  /** PayTR'nin bu işlemden kestiği komisyon (TL) — `kesinti_tutari`. PSP ücret mutabakatı için. */
  providerFeeTl?: number;
  /** Kesinti sonrası kalan tutar (TL) — `net_tutar`. */
  providerNetTl?: number;
  /**
   * İade hareketleri (`returns`). `referenceNo`, iade talebinde gönderdiğimiz
   * `reference_no`'dur (= RefundAttempt.id, tiresiz) — sonucu belirsiz iade
   * denemelerinin otomatik çözümü bu eşlemeye dayanır. PayTR göndermediyse
   * alan undefined kalır (boş string değil): "referanssız iade" ayrımı bozulmasın.
   */
  returns?: Array<{
    amountTl: number | null;
    referenceNo?: string;
    date?: string;
    type?: string;
  }>;
  /** Ham PayTR durum-sorgu zarfı (denetim/mutabakat). PAN/CVV içermez. */
  raw?: Record<string, unknown>;
};

export type PayTRStatusInquiryResult =
  PayTRStatusInquirySuccess | { ok: false; errNo?: string; errMsg?: string };

/** İşlem dökümü (rapor/islem-dokumu) satırı — PSP mutabakatının işlem-seviyesi kaynağı. */
export interface PaytrStatementEntry {
  type: "sale" | "refund"; // islem_tipi S | I
  merchantOid: string;
  amountTl: number;
  /** PayTR'nin kestiği komisyon (kesinti_tutari) — iade satırında olmayabilir. */
  feeTl: number | null;
  feeRatePct: number | null;
  netTl: number | null;
  currency: string;
  installment: number | null;
  cardBrand?: string;
  maskedPan?: string;
  paymentType?: string; // KART | EFT
  /** İşlem günü, ISO (YYYY-MM-DD). PayTR "GG.AA.YYYY" verir, normalize edilir. */
  transactionDate: string;
  raw: Record<string, unknown>;
}

/** Ödeme özeti (rapor/odeme-dokumu) satırı: gerçekleşen ya da (projection) gelecek hakediş. */
export interface PaytrSettlementSummaryEntry {
  datePaid: string; // YYYY-MM-DD
  currency: string;
  salesTl: number;
  returnsTl: number;
  netTl: number;
  merchantIban?: string;
  /** future_payments bloğundan gelen "aktarılacak" satırı. */
  projection: boolean;
  raw: Record<string, unknown>;
}

/** Ödeme detayı (rapor/odeme-detayi) kalemi: hakediş günündeki sipariş dökümü. */
export interface PaytrSettlementDetailEntry {
  merchantOid: string;
  amountTl: number;
  currency: string;
  raw: Record<string, unknown>;
}

export { parsePaytrTestMode } from "./paytr-test-mode.util";
import { PayTRCredentials } from "./paytr-credentials.service";
import { PayTRReportService } from "./paytr-report.service";
import { PayTRTransferService } from "./paytr-transfer.service";
import { parsePaytrMoneyString } from "./paytr-money.util";

// =============================================================================
// PAYTR SERVICE
// =============================================================================

@Injectable()
export class PayTRService implements IPaymentProvider {
  /** #89: provider key used by PaymentProviderRegistry (matches Payment.provider). */
  readonly key = PAYMENT_PROVIDER_PAYTR;
  private readonly logger = new Logger(PayTRService.name);

  constructor(
    private readonly paytr: PayTRCredentials,
    private readonly reports: PayTRReportService,
    private readonly transfers: PayTRTransferService,
    /**
     * PayTR kimlikleri PayTRCredentials'ta; bu yalnız `FRONTEND_URL` içindir.
     * Bilinçli olarak `config/app-urls`'e taşınmadı: oradaki erişimci bir
     * fallback uygular ve bu, ödeme dönüş URL'lerinin davranışını değiştirir
     * (CLAUDE.md §15 "Known, undecided").
     */
    private readonly configService: ConfigService,
  ) {}

  // Kimlik, imza ve yanıt okuma PayTRCredentials'ta yaşar; buradaki kısayollar
  // yalnız çağrı yerlerini okunur tutar (davranış aynı).
  private get merchantId() {
    return this.paytr.merchantId;
  }
  private get merchantKey() {
    return this.paytr.merchantKey;
  }
  private get merchantSalt() {
    return this.paytr.merchantSalt;
  }
  private get baseUrl() {
    return this.paytr.baseUrl;
  }
  private get testMode() {
    return this.paytr.testMode;
  }
  private get httpTimeoutMs() {
    return this.paytr.httpTimeoutMs;
  }
  private parsePaytrJson<T = any>(rawText: string): T | null {
    return this.paytr.parsePaytrJson<T>(rawText);
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

      // PSP kesintisi (virgüllü gelebilir: "2,35") — ücret mutabakatı için.
      const providerFeeTl = PayTRService.parsePaytrMoneyString(
        data.kesinti_tutari != null ? String(data.kesinti_tutari) : undefined,
      );
      const providerNetTl = PayTRService.parsePaytrMoneyString(
        data.net_tutar != null ? String(data.net_tutar) : undefined,
      );

      // İade listesi — reference_no eşlemesi için normalize edilir.
      const returnsRaw = Array.isArray(data.returns) ? data.returns : [];
      const returns = returnsRaw.map((r: any) => ({
        amountTl: PayTRService.parsePaytrMoneyString(
          r?.return_amount != null ? String(r.return_amount) : undefined,
        ),
        referenceNo:
          r?.reference_no != null && String(r.reference_no) !== ""
            ? String(r.reference_no)
            : undefined,
        date: r?.return_date != null ? String(r.return_date) : undefined,
        type: r?.return_type != null ? String(r.return_type) : undefined,
      }));

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
        providerFeeTl: providerFeeTl ?? undefined,
        providerNetTl: providerNetTl ?? undefined,
        returns,
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

  /** Geriye uyum: mevcut çağıranlar PayTRService.parsePaytrMoneyString kullanıyor. */
  static parsePaytrMoneyString = parsePaytrMoneyString;

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
    referenceNo?: string,
  ): Promise<PayTRRefundResponse> {
    const oid = merchantOid.includes("-")
      ? merchantOid.replace(/-/g, "")
      : merchantOid;
    // ÖNEMLİ: PayTR İade API return_amount = ONDALIK TL ("10.25"), KURUŞ DEĞİL.
    // Resmi İade doc: "Ayraç olarak yalnızca bir nokta (.) gönderilmelidir. Örnek: 10.25".
    // Kuruş (×100) göndermek 100 KAT fazla iadeye = maddi kayba yol açar (createDirectPaymentForm
    // ile aynı /odeme birim kuralı). Hash de aynı string ile üretilir.
    const returnAmount = amount.toFixed(2); // ONDALIK TL

    // Build hash for refund — reference_no doküman gereği token'a KATILMAZ.
    const hashStr = `${this.merchantId}${oid}${returnAmount}${this.merchantSalt}`;
    const paytrToken = this.generateHash(hashStr);

    const formData = new URLSearchParams({
      merchant_id: this.merchantId,
      merchant_oid: oid,
      return_amount: returnAmount,
      paytr_token: paytrToken,
    });
    // Opsiyonel takip referansı (durum-sorgu yanıtında geri döner). PayTR
    // alfanümerik/max 64 ister; UUID tireleri vb. temizlenir.
    const cleanRef = (referenceNo ?? "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 64);
    if (cleanRef) formData.set("reference_no", cleanRef);

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
    referenceNo?: string,
  ): Promise<PayTRRefundResponse> {
    return this.createRefund(merchantOid, amount, referenceNo);
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

  private generateHash(data: string): string {
    return this.paytr.generateHash(data);
  }

  // ==========================================================================
  // PLATFORM TRANSFER — gövde PayTRTransferService'te. İmzalar burada kalır:
  // IPaymentProvider sözleşmesinin parçalar ve payout.service onları sağlayıcı
  // üzerinden çağırır.
  // ==========================================================================

  createPlatformTransfer(
    ...args: Parameters<PayTRTransferService["createPlatformTransfer"]>
  ) {
    return this.transfers.createPlatformTransfer(...args);
  }

  verifyTransferCallback(params: { transIds: string; hash: string }): boolean {
    return this.transfers.verifyTransferCallback(params);
  }

  getReturnedTransfers(
    ...args: Parameters<PayTRTransferService["getReturnedTransfers"]>
  ) {
    return this.transfers.getReturnedTransfers(...args);
  }

  resendReturnedTransfers(
    ...args: Parameters<PayTRTransferService["resendReturnedTransfers"]>
  ) {
    return this.transfers.resendReturnedTransfers(...args);
  }

  // ==========================================================================
  // RAPOR SERVİSLERİ — gövde PayTRReportService'te.
  // İmzalar burada kalır: IPaymentProvider sözleşmesinin parçasılar ve
  // paytr-report-sync onları sağlayıcı üzerinden çağırır.
  // ==========================================================================

  getTransactionStatement(
    ...args: Parameters<PayTRReportService["getTransactionStatement"]>
  ) {
    return this.reports.getTransactionStatement(...args);
  }

  getSettlementSummary(
    ...args: Parameters<PayTRReportService["getSettlementSummary"]>
  ) {
    return this.reports.getSettlementSummary(...args);
  }

  getSettlementDetail(
    ...args: Parameters<PayTRReportService["getSettlementDetail"]>
  ) {
    return this.reports.getSettlementDetail(...args);
  }
}
