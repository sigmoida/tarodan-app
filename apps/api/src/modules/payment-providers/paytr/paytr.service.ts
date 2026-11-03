import {
  Injectable,
  BadRequestException,
  Inject,
  Logger,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaytrMerchant } from "@prisma/client";
import { i18nMessage } from "../../i18n";
import type { IPaymentProvider } from "../payment-provider.interface";
import { PAYMENT_PROVIDER_PAYTR } from "../payment-provider.interface";
import {
  ProviderRefundNotSentException,
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
  // Direkt API 2. Adim (https://dev.paytr.com/direkt-api/direkt-api-2-adim):
  // "Islemde yapilan taksit sayisi" (0 = single payment).
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
  /**
   * Payment method, "card" | "eft" as in the callback's `payment_type`.
   * Durum-sorgu documents it as `odeme_tipi` (KART | EFT), mapped here.
   */
  paymentType?: string;
  /** `taksit`: installment count, 0 = single payment, 2-12 (0/1 = single). */
  installmentCount?: number;
  /** `kart_marka`: card brand/family as PayTR reports it (e.g. "WORLD", "BONUS"). */
  cardBrand?: string;
  /**
   * `masked_pan`: first 6 + last 4 digits, masked. Card data: never log it,
   * never put it in Sentry; store only where a field is meant for it.
   */
  maskedPan?: string;
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
import {
  PayTRCredentials,
  type PaytrMerchantCredentials,
} from "./paytr-credentials.service";
import { PayTRReportService } from "./paytr-report.service";
import { PayTRTransferService } from "./paytr-transfer.service";
import { parsePaytrMoneyString } from "./paytr-money.util";
import {
  classifyPaytrFetchError,
  networkErrorReason,
} from "./paytr-fetch-retry.util";
import { isNothingLeftToRefund } from "./paytr-refund-rejection";
import {
  isPaytrCardFamily,
  isPaytrInstallmentCount,
  parsePaytrInstallmentRates,
  parsePaytrInstallmentCount,
  type PaytrBinLookupResult,
  type PaytrCardFamily,
  type PaytrInstallmentRatesResult,
} from "./paytr-installments";
import {
  isPaytrSuccess,
  isPlainRecord,
  paytrYesNo,
  textOf,
} from "./paytr-response.util";
import { errorMessage } from "../../../common/helpers/error-message";

// =============================================================================
// PAYTR SERVICE
// =============================================================================

/**
 * DI token'ı: PayTRService örneğinin bağlı olduğu mağaza. Kök örnek (Nest'in
 * enjekte ettiği) bu token sağlanmadığı için pazaryerine bağlıdır; diğer
 * mağazanın örneği `forMerchant()` ile türetilir.
 */
export const PAYTR_SERVICE_MERCHANT = Symbol("PAYTR_SERVICE_MERCHANT");

@Injectable()
export class PayTRService implements IPaymentProvider {
  /** #89: provider key used by PaymentProviderRegistry (matches Payment.provider). */
  readonly key = PAYMENT_PROVIDER_PAYTR;
  /** Bu örneğin her çağrısının imzalandığı PayTR mağazası. */
  readonly merchant: PaytrMerchant;
  private readonly logger = new Logger(PayTRService.name);
  /** Mağaza → örnek; türetilen tüm örnekler aynı haritayı paylaşır. */
  private bound: Map<PaytrMerchant, PayTRService>;

  constructor(
    private readonly paytr: PayTRCredentials,
    private readonly reports: PayTRReportService,
    private readonly transfers: PayTRTransferService,
    /**
     * PayTR kimlikleri PayTRCredentials'ta; bu yalnız `FRONTEND_URL` içindir.
     * Bilinçli olarak `config/app-urls`'e taşınmadı: oradaki erişimci bir
     * fallback uygular ve bu, ödeme dönüş URL'lerinin davranışını değiştirir
     * (apps/api/CLAUDE.md, "Known, undecided").
     */
    private readonly configService: ConfigService,
    @Optional()
    @Inject(PAYTR_SERVICE_MERCHANT)
    merchant?: PaytrMerchant,
  ) {
    this.merchant = merchant ?? PaytrMerchant.marketplace;
    this.bound = new Map([[this.merchant, this]]);
  }

  /**
   * Aynı servisin başka bir mağazaya bağlı örneği. Ödeme kaydı hangi mağazada
   * alındıysa sonraki her PayTR çağrısı (durum-sorgu, iade, kart silme) o
   * mağazanın örneğinden yapılır — bkz. PaymentProviderRegistry.resolve.
   */
  forMerchant(merchant: PaytrMerchant): PayTRService {
    const existing = this.bound.get(merchant);
    if (existing) return existing;
    const created = new PayTRService(
      this.paytr,
      this.reports,
      this.transfers,
      this.configService,
      merchant,
    );
    created.bound = this.bound;
    this.bound.set(merchant, created);
    return created;
  }

  /** Bağlı mağazanın kimliği + imzası (anahtar/tuz bu nesnenin dışına çıkmaz). */
  private get creds(): PaytrMerchantCredentials {
    return this.paytr.forMerchant(this.merchant);
  }

  // Kimlik ve yanıt okuma PayTRCredentials'ta yaşar; buradaki kısayollar
  // yalnız çağrı yerlerini okunur tutar.
  private get merchantId() {
    return this.creds.merchantId;
  }
  private get isConfigured() {
    return this.creds.isConfigured;
  }
  private get baseUrl() {
    return this.paytr.baseUrl;
  }
  private get testMode() {
    return this.creds.testMode;
  }
  /**
   * `test_mode` kararı: test şeridi (`forced=true`) her zaman test modunu açar;
   * aksi halde mağazanın ortam ayarı geçer. Canlı hesap için `false` gelmesi
   * ortam ayarını EZMEZ — staging'de `PAYTR_TEST_MODE=true` iken gerçek
   * tahsilat yapılmasın.
   */
  private resolveTestMode(forced?: boolean): boolean {
    return forced === true || this.testMode;
  }
  private get httpTimeoutMs() {
    return this.paytr.httpTimeoutMs;
  }
  private parsePaytrJson<T = unknown>(rawText: string): T | null {
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
    if (!this.isConfigured) {
      this.logger.warn("PayTR status inquiry skipped: credentials missing");
      return { ok: false, errMsg: "PayTR not configured" };
    }
    if (!merchantOid?.trim()) {
      return { ok: false, errMsg: "merchant_oid required" };
    }

    const paytrToken = this.creds.signWithSalt(this.merchantId + merchantOid);

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
        // Digit runs masked: a garbled answer may still hold `masked_pan`.
        this.logger.error(
          `PayTR durum-sorgu oid=${merchantOid}: answer is not JSON: ${rawText.slice(0, 200).replace(/\d{4,}/g, "#")}`,
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
        // Field names only: the answer carries card data (`masked_pan`).
        this.logger.warn(
          `PayTR durum-sorgu oid=${merchantOid}: payment_total not parseable (fields: ${Object.keys(data).join(", ")})`,
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

      const paymentType = statusInquiryPaymentType(data);
      // Durum Sorgu (https://dev.paytr.com/durum-sorgu) documents the count
      // as `taksit` ("0, 2-12"). `installment_count` is the callback's name
      // (Direkt API 2. Adim) and stays only as a fallback.
      const installmentCount = parsePaytrInstallmentCount(
        data.taksit ?? data.installment_count ?? data.InstallmentCount,
      );

      // PSP kesintisi (virgüllü gelebilir: "2,35") — ücret mutabakatı için.
      const providerFeeTl = PayTRService.parsePaytrMoneyString(
        data.kesinti_tutari != null ? String(data.kesinti_tutari) : undefined,
      );
      const providerNetTl = PayTRService.parsePaytrMoneyString(
        data.net_tutar != null ? String(data.net_tutar) : undefined,
      );

      // Refunds, normalized for the reference_no match.
      const returnsRaw: unknown[] = Array.isArray(data.returns)
        ? data.returns
        : [];
      const returns = returnsRaw.map((entry) => {
        const r = isPlainRecord(entry) ? entry : {};
        return {
          amountTl: PayTRService.parsePaytrMoneyString(
            r.return_amount != null ? String(r.return_amount) : undefined,
          ),
          referenceNo:
            r.reference_no != null && String(r.reference_no) !== ""
              ? String(r.reference_no)
              : undefined,
          date: r.return_date != null ? String(r.return_date) : undefined,
          type: r.return_type != null ? String(r.return_type) : undefined,
        };
      });

      return {
        ok: true,
        paymentTotalTl,
        paymentAmountTl: amountTl,
        paymentDate,
        currency,
        paymentType,
        installmentCount,
        cardBrand: textOf(data.kart_marka),
        maskedPan: textOf(data.masked_pan),
        providerFeeTl: providerFeeTl ?? undefined,
        providerNetTl: providerNetTl ?? undefined,
        returns,
        raw: data,
      };
    } catch (error: unknown) {
      const message = errorMessage(error);
      this.logger.error(
        `PayTR durum-sorgu oid=${merchantOid} failed: ${message}`,
      );
      return {
        ok: false,
        errMsg: message || "PayTR status inquiry error",
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
    // Wave 4: sabit-zamanlı karşılaştırma PaytrMerchantCredentials içinde.
    // Hash BU örneğin mağazasının anahtarıyla doğrulanır.
    return this.creds.verifyPaymentNotification({
      merchantOid: callback.merchant_oid,
      status: callback.status,
      totalAmount: callback.total_amount,
      hash: callback.hash,
    });
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
    // Same validation as the status inquiry's `taksit` (0-12, digits only).
    const installment = parsePaytrInstallmentCount(callback.installment_count);
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
      installmentCount: installment,
      currency: callback.currency,
      paymentAmount,
      testMode: callback.test_mode === "1",
    };
  }

  // ==========================================================================
  // REFUND
  // ==========================================================================

  /**
   * Refund request (`/odeme/iade`). Never retried here: it moves money, the
   * caller (the RefundAttempt ledger) decides. A failure is typed by what it
   * means for the money:
   *
   * - `ProviderRefundNotSentException`: the request provably never left the
   *   host (building it failed, or a connect-phase network error,
   *   `classifyPaytrFetchError`). Safe to send again.
   * - `ProviderRefundRejectedException`: PayTR answered "no";
   *   `nothingLeftToRefund` when the payment has nothing left to refund.
   * - `ProviderRefundOutcomeUnknownException`: anything after the request
   *   left (reset, our timeout, unreadable or empty answer). PayTR may have
   *   refunded; never resend without checking.
   *
   * One warn line per failure: the caller logs the decision at the right
   * level, so an error here would raise the same incident twice (Sentry
   * TARODAN-API-3N was this line, once per sweep run).
   */
  async createRefund(
    merchantOid: string,
    amount: number, // in TL
    referenceNo?: string,
  ): Promise<PayTRRefundResponse> {
    const oid = merchantOid.includes("-")
      ? merchantOid.replace(/-/g, "")
      : merchantOid;
    // Optional tracking reference (echoed in the status inquiry). PayTR wants
    // letters and digits, at most 64: UUID hyphens and the like are removed.
    const cleanRef = (referenceNo ?? "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 64);
    const subject = `PayTR refund oid=${oid} ref=${cleanRef || "-"}`;

    // Anything failing before fetch (credentials, signing) never reached PayTR.
    let body: string;
    let signal: AbortSignal;
    try {
      // IMPORTANT: the PayTR refund API's return_amount is DECIMAL TL
      // ("10.25"), NOT kurus. Refund doc: "Ayraç olarak yalnızca bir nokta (.)
      // gönderilmelidir. Örnek: 10.25". Sending kurus (x100) refunds 100 times
      // the amount (same /odeme unit rule as createDirectPaymentForm). The
      // hash is built from the same string.
      const returnAmount = amount.toFixed(2); // decimal TL

      // Refund hash; per the doc reference_no is NOT part of the token.
      const paytrToken = this.creds.signWithSalt(
        `${this.merchantId}${oid}${returnAmount}`,
      );

      const formData = new URLSearchParams({
        merchant_id: this.merchantId,
        merchant_oid: oid,
        return_amount: returnAmount,
        paytr_token: paytrToken,
      });
      if (cleanRef) formData.set("reference_no", cleanRef);
      body = formData.toString();
      signal = AbortSignal.timeout(this.httpTimeoutMs);
    } catch (error) {
      throw this.refundNotSent(
        subject,
        `request not built: ${networkErrorReason(error)}`,
      );
    }

    let response: Response;
    try {
      response = await fetch("https://www.paytr.com/odeme/iade", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal,
      });
    } catch (error) {
      const reason = networkErrorReason(error);
      if (classifyPaytrFetchError(error) === "not_sent") {
        throw this.refundNotSent(subject, reason);
      }
      throw this.refundOutcomeUnknown(
        subject,
        reason,
        i18nMessage("server.payment.refundError"),
      );
    }

    // From here on PayTR received the request: anything but a parsed answer
    // leaves the outcome unknown.
    let rawText: string;
    try {
      rawText = await response.text();
    } catch (error) {
      throw this.refundOutcomeUnknown(
        subject,
        `answer not readable: ${networkErrorReason(error)}`,
        i18nMessage("server.payment.refundError"),
      );
    }
    const data = this.parsePaytrJson<PayTRRefundResponse>(rawText);
    if (!data) {
      throw this.refundOutcomeUnknown(
        subject,
        "answer is empty or not JSON",
        i18nMessage("server.payment.refundResponseInvalid"),
      );
    }

    if (data.status !== "success") {
      const nothingLeft = isNothingLeftToRefund(data.err_msg);
      this.logger.warn(
        `${subject}: rejected${nothingLeft ? " (nothing left to refund)" : ""}${data.err_no ? ` err_no=${data.err_no}` : ""}: ${data.err_msg ?? "no message"}`,
      );
      throw new ProviderRefundRejectedException(
        data.err_msg || i18nMessage("server.payment.refundFailed"),
        nothingLeft,
      );
    }

    return data;
  }

  private refundNotSent(
    subject: string,
    detail: string,
  ): ProviderRefundNotSentException {
    this.logger.warn(`${subject}: not sent, safe to retry: ${detail}`);
    return new ProviderRefundNotSentException(
      i18nMessage("server.payment.refundInitiationFailed"),
      detail,
    );
  }

  private refundOutcomeUnknown(
    subject: string,
    detail: string,
    response: ReturnType<typeof i18nMessage>,
  ): ProviderRefundOutcomeUnknownException {
    this.logger.warn(`${subject}: outcome unknown: ${detail}`);
    return new ProviderRefundOutcomeUnknownException(response);
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
  // https://dev.paytr.com/direkt-api/bin-sorgulama-servisi
  // https://dev.paytr.com/direkt-api/taksit-sorgulama
  // ==========================================================================

  /**
   * BIN lookup (`POST /odeme/api/bin-detail`): bank, scheme, type and card
   * family of the first 6 or 8 card digits ("Maksimum dogrulama icin 8 hane
   * kullanin"). Token, from the doc samples: base64(HMAC-SHA256(bin_number +
   * merchant_id + merchant_salt, merchant_key)). Only the BIN is sent; it is
   * never logged.
   *
   * `status` per the doc: "success"; "failed" when the BIN is not defined
   * (e.g. a foreign card), a stable answer the caller may cache; "error"
   * when the query had a problem (also network errors here), not cacheable.
   * Never throws.
   */
  async lookupBin(binNumber: string): Promise<PaytrBinLookupResult> {
    if (!this.isConfigured) {
      return { ok: false, outcome: "error", errMsg: "PayTR not configured" };
    }
    const digits = (binNumber ?? "").replace(/\D/g, "");
    if (digits.length < 6) {
      return { ok: false, outcome: "error", errMsg: "bin_number too short" };
    }
    // The doc takes 6 or 8 digits; 7 is sent as 6.
    const bin = digits.length >= 8 ? digits.slice(0, 8) : digits.slice(0, 6);

    const paytrToken = this.creds.signWithSalt(bin + this.merchantId);
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
      const data = this.parsePaytrJson<Record<string, unknown>>(
        await response.text(),
      );
      if (!isPlainRecord(data)) {
        return { ok: false, outcome: "error", errMsg: "Invalid BIN answer" };
      }
      if (!isPaytrSuccess(data.status)) {
        const failed = textOf(data.status)?.toLowerCase() === "failed";
        return {
          ok: false,
          outcome: failed ? "failed" : "error",
          errMsg:
            textOf(data.err_msg) ??
            (failed ? "BIN not defined" : "BIN lookup failed"),
        };
      }
      const brand = textOf(data.brand)?.toLowerCase();
      return {
        ok: true,
        outcome: "success",
        bank: textOf(data.bank),
        // Kept as text: the doc's example "0010" has leading zeros.
        bankCode: textOf(data.bankCode),
        schema: textOf(data.schema)?.toUpperCase(),
        cardType: textOf(data.cardType)?.toLowerCase(),
        brand,
        cardFamily: isPaytrCardFamily(brand) ? brand : undefined,
        businessCard: paytrYesNo(data.businessCard),
        allowNon3d: paytrYesNo(data.allow_non3d),
      };
    } catch (error: unknown) {
      // warn, not error: the caller decides what an unavailable BIN means
      // (the installment options fall back to a single payment).
      const message = errorMessage(error);
      this.logger.warn(`PayTR BIN lookup failed: ${message}`);
      return {
        ok: false,
        outcome: "error",
        errMsg: message || "BIN lookup error",
      };
    }
  }

  /**
   * The store's installment rate table (`POST /odeme/taksit-oranlari`, not
   * bin-detail). Doc: https://dev.paytr.com/direkt-api/taksit-sorgulama.
   * Token: base64(HMAC-SHA256(merchant_id + request_id + merchant_salt,
   * merchant_key)). `request_id` is at most 32 characters and is echoed in
   * the answer; the caller makes it unique (the snapshot id).
   *
   * The answer's rates are in `oranlar` (per card family, per count), parsed
   * by `parsePaytrInstallmentRates`; `max_inst_non_bus` is the store's
   * maximum count for non-business cards. "Oranlar gunluk olarak
   * degisebilir": the caller stores a snapshot with `raw` and prices from it.
   * Where `single_ratio=1` / `abroad_ratio=1` put their rates is not
   * documented; they stay in `raw` until the staging capture (hub plan S0)
   * shows the field, rather than being guessed (an echoed "1" flag must not
   * be read as a 1% rate).
   * Never throws: a failure is `{ ok: false }`.
   */
  async getInstallmentRates(
    requestId: string,
    options?: { singleRatio?: boolean; abroadRatio?: boolean },
  ): Promise<PaytrInstallmentRatesResult> {
    if (!this.isConfigured) {
      return { ok: false, errMsg: "PayTR not configured" };
    }
    const reqId = (requestId ?? "").trim();
    // Never truncate: a cut id would not match the snapshot that asked for it.
    if (reqId.length === 0 || reqId.length > 32) {
      return { ok: false, errMsg: "request_id must be 1-32 characters" };
    }
    const paytrToken = this.creds.signWithSalt(this.merchantId + reqId);
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
      const data = this.parsePaytrJson<Record<string, unknown>>(
        await response.text(),
      );
      if (!isPlainRecord(data) || !isPaytrSuccess(data.status)) {
        return {
          ok: false,
          errMsg: textOf(data?.err_msg) ?? "Installment rates unavailable",
        };
      }
      const echoedId = textOf(data.request_id);
      if (echoedId !== undefined && echoedId !== reqId) {
        this.logger.warn(
          `PayTR taksit-oranlari request_id mismatch: sent=${reqId} got=${echoedId}`,
        );
        return { ok: false, errMsg: "request_id mismatch" };
      }
      const { rates, ignored } = parsePaytrInstallmentRates(data.oranlar);
      if (ignored.length > 0) {
        this.logger.warn(
          `PayTR taksit-oranlari request_id=${reqId}: ${ignored.length} entries not understood: ${ignored.slice(0, 20).join(", ")}`,
        );
      }
      return {
        ok: true,
        requestId: reqId,
        maxInstallmentNonBusiness: parsePaytrInstallmentCount(
          data.max_inst_non_bus,
        ),
        rates,
        ignored,
        raw: data,
      };
    } catch (error: unknown) {
      const message = errorMessage(error);
      this.logger.error(
        `PayTR taksit-oranlari request_id=${reqId} failed: ${message}`,
      );
      return { ok: false, errMsg: message || "Installment rates error" };
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
      /**
       * Installments: an integer 2-12 (signed as `installment_count`).
       * Absent, 0 or 1 is a single payment ("0"); anything else throws.
       */
      installmentCount?: number;
      /**
       * `card_type` (Direkt API 1. Adim, optional, "Taksitli islemlerde
       * kullanmak uzere"): the card family from the BIN lookup's `brand`.
       * Sent only with an installment count, never on a single payment,
       * and not part of the token, so it cannot change the signed amount.
       */
      cardType?: PaytrCardFamily;
      /**
       * The query of BOTH return URLs, e.g. "paymentId=...&type=boost"
       * (`paymentReturnQuery`): the success page verifies the payment with it,
       * the fail page shows the right purchase and releases a still pending
       * payment (`confirm-failed`).
       */
      returnQueryParams?: string;
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
      /**
       * Test şeridi ödemesi: canlı merchant'ta `test_mode=1` (PayTR test kartı,
       * gerçek tahsilat yok). `false`/verilmezse ortam ayarı (`PAYTR_TEST_MODE`) geçer.
       */
      testMode?: boolean;
    },
  ): Promise<{
    action: string;
    method: "POST";
    fields: Array<{ name: string; value: string }>;
    requireCvv: boolean;
  }> {
    if (!this.isConfigured) {
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
    const { installmentCount, cardType } = directFormInstallment(options);
    const currency = "TL";
    const testMode = this.resolveTestMode(options?.testMode);
    const testModeStr = testMode ? "1" : "0";
    // Kullanıcının başlattığı checkout her zaman 3D Secure'dur. Non3D yalnız
    // ayrı recurring akışında, açık mağaza yetkisiyle sunucudan kullanılır.
    const non3d = "0";

    const frontendUrl = this.configService.get("FRONTEND_URL");
    const returnQuery = options?.returnQueryParams
      ? `?${options.returnQueryParams}`
      : "";
    const merchantOkUrl = `${frontendUrl}/payment/success${returnQuery}`;
    const merchantFailUrl = `${frontendUrl}/payment/fail${returnQuery}`;

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
    const paytrToken = this.creds.signWithSalt(hashStr);

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
      debug_on: testMode ? "1" : "0",
      client_lang: "tr",
    });
    if (cardType) formData.set("card_type", cardType);

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
    /** Test şeridi üyeliği: `test_mode=1` (bkz. createDirectPaymentForm). */
    testMode?: boolean;
  }): Promise<{
    status: "success" | "failed" | "wait_callback";
    reason?: string;
    tryAgain?: boolean;
    /** Ham PayTR recurring yanıtı (gözlemlenebilirlik/mutabakat). PAN/CVV içermez. */
    raw?: Record<string, unknown>;
  }> {
    if (!this.isConfigured) {
      throw new BadRequestException(
        i18nMessage("server.payment.notConfigured"),
      );
    }
    const paymentAmount = params.amount.toFixed(2); // ONDALIK TL (recurring kuruş kabul etmez)
    const paymentType = "card";
    const installmentCount = "0";
    const currency = "TL";
    const testMode = this.resolveTestMode(params.testMode);
    const testModeStr = testMode ? "1" : "0";
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
    const paytrToken = this.creds.signWithSalt(hashStr);

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
      debug_on: testMode ? "1" : "0",
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
    } catch (error: unknown) {
      const message = errorMessage(error);
      this.logger.error(
        `PayTR recurring failed oid=${params.merchantOid}: ${message}`,
      );
      // Network error or timeout: treated as temporary, may be retried.
      return {
        status: "failed",
        reason: message || "bağlantı hatası",
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
    if (!this.isConfigured) {
      throw new BadRequestException(
        i18nMessage("server.payment.notConfigured"),
      );
    }
    const paytrToken = this.creds.signWithSalt(utoken);
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
      const data = this.parsePaytrJson<
        | PaytrCapiCardRaw[]
        | { status?: string; err_msg?: string; cards?: PaytrCapiCardRaw[] }
      >(rawText);
      // Error: {status:'error', err_msg}. No match: empty JSON. Success: a card array.
      if (!data || (!Array.isArray(data) && data.status === "error")) {
        if (data && !Array.isArray(data))
          this.logger.warn(`PayTR capi/list error: ${data.err_msg}`);
        return [];
      }
      const cards: PaytrCapiCardRaw[] = Array.isArray(data)
        ? data
        : Array.isArray(data.cards)
          ? data.cards
          : [];
      return cards
        .map((c) => ({
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
        .filter((c): c is typeof c & { ctoken: string } => !!c.ctoken);
    } catch (error: unknown) {
      this.logger.error(
        `PayTR capi/list failed merchant=${this.merchant}: ${errorMessage(error)}`,
      );
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
    if (!this.isConfigured) {
      throw new BadRequestException(
        i18nMessage("server.payment.notConfigured"),
      );
    }
    const paytrToken = this.creds.signWithSalt(ctoken + utoken);
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
    } catch (error: unknown) {
      const message = errorMessage(error);
      this.logger.error(`PayTR capi/delete failed: ${message}`);
      return { status: "error", reason: message };
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  // ==========================================================================
  // PLATFORM TRANSFER — gövde PayTRTransferService'te. İmzalar burada kalır:
  // IPaymentProvider sözleşmesinin parçalar ve payout.service onları sağlayıcı
  // üzerinden çağırır.
  // ==========================================================================

  /** Transferler yalnız pazaryeri mağazasındandır; başka mağazaya bağlı örnek reddeder. */
  private assertMarketplaceTransfer(): void {
    if (this.merchant !== PaytrMerchant.marketplace) {
      throw new BadRequestException(
        i18nMessage("server.payment.paytrPlatformTransferFailed", {
          reason: `platform transfer is only available on the marketplace merchant (got ${this.merchant})`,
        }),
      );
    }
  }

  createPlatformTransfer(
    ...args: Parameters<PayTRTransferService["createPlatformTransfer"]>
  ) {
    this.assertMarketplaceTransfer();
    return this.transfers.createPlatformTransfer(...args);
  }

  verifyTransferCallback(params: { transIds: string; hash: string }): boolean {
    if (this.merchant !== PaytrMerchant.marketplace) return false;
    return this.transfers.verifyTransferCallback(params);
  }

  getReturnedTransfers(
    ...args: Parameters<PayTRTransferService["getReturnedTransfers"]>
  ) {
    this.assertMarketplaceTransfer();
    return this.transfers.getReturnedTransfers(...args);
  }

  resendReturnedTransfers(
    ...args: Parameters<PayTRTransferService["resendReturnedTransfers"]>
  ) {
    this.assertMarketplaceTransfer();
    return this.transfers.resendReturnedTransfers(...args);
  }

  // ==========================================================================
  // RAPOR SERVİSLERİ — gövde PayTRReportService'te.
  // İmzalar burada kalır: IPaymentProvider sözleşmesinin parçasılar ve
  // paytr-report-sync onları sağlayıcı üzerinden çağırır.
  // ==========================================================================

  getTransactionStatement(params: { startDate: string; endDate: string }) {
    return this.reports.getTransactionStatement(params, this.merchant);
  }

  getSettlementSummary(params: { startDate: string; endDate: string }) {
    return this.reports.getSettlementSummary(params, this.merchant);
  }

  getSettlementDetail(params: { date: string }) {
    return this.reports.getSettlementDetail(params, this.merchant);
  }
}

/**
 * Payment method of a durum-sorgu answer in the callback's vocabulary
 * ("card" | "eft"). The doc field is `odeme_tipi` (KART | EFT); an explicit
 * `payment_type` wins when PayTR sends one.
 */
function statusInquiryPaymentType(
  data: Record<string, unknown>,
): string | undefined {
  const explicit = textOf(data.payment_type ?? data.PaymentType);
  if (explicit !== undefined) return explicit;
  const method = textOf(data.odeme_tipi)?.toUpperCase();
  if (method === undefined) return undefined;
  if (method === "KART") return "card";
  if (method === "EFT") return "eft";
  return method.toLowerCase();
}

/**
 * `installment_count` and `card_type` of a Direct API form (Direkt API 1.
 * Adim: "0" single payment, 2-12 installments). Absent, 0 and 1 stay a
 * single payment exactly as before; a count outside 2-12 or a card type
 * outside PayTR's list is a programming error and throws (fail closed: no
 * form is signed). `card_type` is only meaningful for installments, so a
 * single payment never sends it.
 */
function directFormInstallment(options?: {
  installmentCount?: number;
  cardType?: string;
}): { installmentCount: string; cardType?: PaytrCardFamily } {
  const count = options?.installmentCount;
  if (count === undefined || count === 0 || count === 1) {
    return { installmentCount: "0" };
  }
  if (!isPaytrInstallmentCount(count)) {
    throw new Error(`PayTR installment_count must be 0 or 2-12, got ${count}`);
  }
  const cardType = options?.cardType;
  if (cardType !== undefined && !isPaytrCardFamily(cardType)) {
    throw new Error(`PayTR card_type is not a card family: ${cardType}`);
  }
  return { installmentCount: String(count), cardType };
}

/** One card of a `capi/list` answer, as PayTR sends it. */
interface PaytrCapiCardRaw {
  ctoken?: string;
  last_4: string;
  require_cvv?: string | number;
  month?: string;
  year?: string;
  c_brand?: string;
  c_type?: string;
  schema?: string;
  c_bank?: string;
  businessCard?: string;
}
