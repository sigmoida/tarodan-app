import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

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
  price: number; // in kuruş (1 TL = 100 kuruş)
  quantity: number;
}

export interface PayTRPaymentRequest {
  merchantOid: string;
  email: string;
  paymentAmount: number; // in kuruş
  paymentType: 'card' | 'eft';
  installmentCount: number;
  currency: 'TL' | 'EUR' | 'USD' | 'GBP' | 'RUB';
  testMode: '0' | '1';
  noInstallment: '0' | '1';
  maxInstallment: '0' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12';
  userName: string;
  userAddress: string;
  userPhone: string;
  merchantOkUrl: string;
  merchantFailUrl: string;
  userBasket: string; // Base64 encoded JSON array
  debugOn: '0' | '1';
  lang: 'tr' | 'en';
  userIp: string;
  timeoutLimit?: string;
  cardType?: 'bonus' | 'axess' | 'maximum' | 'world' | 'cardfinans' | 'paraf';
  syncMode?: '0' | '1';
}

export interface PayTRIframeResponse {
  status: 'success' | 'failed';
  reason?: string;
  token?: string;
}

export interface PayTRCallbackData {
  merchant_oid: string;
  status: 'success' | 'failed';
  total_amount: string;
  hash: string;
  failed_reason_code?: string;
  failed_reason_msg?: string;
  test_mode?: string;
  payment_type?: string;
  currency?: string;
  payment_amount?: string;
}

export interface PayTRRefundRequest {
  merchantOid: string;
  returnAmount: number; // in kuruş
}

export interface PayTRRefundResponse {
  status: 'success' | 'error';
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
};

export type PayTRStatusInquiryResult =
  | PayTRStatusInquirySuccess
  | { ok: false; errNo?: string; errMsg?: string };

/** PAYTR_TEST_MODE: true / 1 / yes → test */
export function parsePaytrTestMode(raw: string | undefined): boolean {
  if (raw === undefined || raw === '') return true;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

// =============================================================================
// PAYTR SERVICE
// =============================================================================

@Injectable()
export class PayTRService {
  private readonly logger = new Logger(PayTRService.name);
  private readonly merchantId: string;
  private readonly merchantKey: string;
  private readonly merchantSalt: string;
  private readonly baseUrl: string;
  private readonly testMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.merchantId = (this.configService.get('PAYTR_MERCHANT_ID', '') || '').trim();
    this.merchantKey = (this.configService.get('PAYTR_MERCHANT_KEY', '') || '').trim();
    this.merchantSalt = (this.configService.get('PAYTR_MERCHANT_SALT', '') || '').trim();
    this.baseUrl = 'https://www.paytr.com/odeme';
    this.testMode = parsePaytrTestMode(this.configService.get('PAYTR_TEST_MODE'));

    const customCallback = (this.configService.get('PAYTR_CALLBACK_URL', '') || '').trim();
    const apiUrl = (this.configService.get('API_URL', 'http://localhost:3001') || '').replace(/\/$/, '');
    const effectiveCallback = customCallback || `${apiUrl}/api/payments/callback/paytr`;
    this.logger.log(`PayTR callback (panel Bildirim URL): ${effectiveCallback}`);
    if (effectiveCallback.includes('localhost')) {
      this.logger.warn(
        'PayTR genelde localhost bildirim kabul etmez; ngrok ve PAYTR_CALLBACK_URL kullanın, panelde aynı URL tanımlı olsun.',
      );
    }

    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      this.logger.warn('⚠️ PayTR API credentials not configured');
    } else {
      this.logger.log(`PayTR test mode: ${this.testMode ? 'ON' : 'OFF'}`);
    }
  }

  // ==========================================================================
  // IFRAME PAYMENT (Recommended by PayTR)
  // ==========================================================================

  /**
   * Create iframe token for payment
   */
  async createIframeToken(
    orderId: string,
    amount: number, // in TL
    buyer: PayTRBuyer,
    basketItems: PayTRBasketItem[],
    options?: {
      installmentCount?: number;
      maxInstallment?: number;
      lang?: 'tr' | 'en';
      timeoutLimit?: number;
      /** e.g. "type=membership" so success page redirects to membership success */
      successQueryParams?: string;
    },
  ): Promise<{ token: string; iframeUrl: string }> {
    const paymentAmount = Math.round(amount * 100); // Convert to kuruş
    const successBase = `${this.configService.get('FRONTEND_URL')}/payment/success`;
    const merchantOkUrl = options?.successQueryParams
      ? `${successBase}?${options.successQueryParams}`
      : successBase;
    const merchantFailUrl = `${this.configService.get('FRONTEND_URL')}/payment/fail`;

    // Encode basket (must match POST user_basket)
    const userBasket = this.encodeBasket(basketItems);

    const noInstallment = options?.installmentCount === 1 ? '1' : '0';
    const maxInstallment = String(options?.maxInstallment ?? 0);
    const paymentAmountStr = String(paymentAmount);
    const testModeStr = this.testMode ? '1' : '0';

    // iFrame API: paytr_token = base64(HMAC-SHA256(merchant_key, hashStr + merchant_salt))
    // hashStr = merchant_id + user_ip + merchant_oid + email + payment_amount + user_basket + no_installment + max_installment + currency + test_mode
    const hashStr =
      this.merchantId +
      buyer.ip +
      orderId +
      buyer.email +
      paymentAmountStr +
      userBasket +
      noInstallment +
      maxInstallment +
      'TL' +
      testModeStr;
    const paytrToken = crypto
      .createHmac('sha256', this.merchantKey)
      .update(hashStr + this.merchantSalt)
      .digest('base64');

    // Build request data (field values must match hash above)
    const formData = new URLSearchParams({
      merchant_id: this.merchantId,
      user_ip: buyer.ip,
      merchant_oid: orderId,
      email: buyer.email,
      payment_amount: paymentAmountStr,
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: this.testMode ? '1' : '0',
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: `${buyer.name} ${buyer.surname}`,
      user_address: buyer.address,
      user_phone: buyer.phone,
      merchant_ok_url: merchantOkUrl,
      merchant_fail_url: merchantFailUrl,
      timeout_limit: String(options?.timeoutLimit || 30),
      currency: 'TL',
      test_mode: this.testMode ? '1' : '0',
      lang: options?.lang || 'tr',
    });

    try {
      const response = await fetch(`${this.baseUrl}/api/get-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const rawText = await response.text();
      if (!rawText?.trim()) {
        this.logger.error(`PayTR API boş yanıt döndü. HTTP ${response.status}`);
        throw new BadRequestException(
          `PayTR yanıt vermedi (HTTP ${response.status}). Merchant ID/Key/Salt ve test modunu kontrol edin.`,
        );
      }

      let data: PayTRIframeResponse;
      try {
        data = JSON.parse(rawText);
      } catch {
        this.logger.error(`PayTR API JSON değil. Status: ${response.status}, body: ${rawText.slice(0, 200)}`);
        throw new BadRequestException(
          'PayTR geçerli yanıt dönmedi. API bilgilerinizi ve PayTR panel ayarlarını kontrol edin.',
        );
      }

      if (data.status !== 'success' || !data.token) {
        this.logger.error(`PayTR token error: ${data.reason}`);
        throw new BadRequestException(data.reason || 'PayTR token oluşturulamadı');
      }

      return {
        token: data.token,
        iframeUrl: `https://www.paytr.com/odeme/guvenli/${data.token}`,
      };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('PayTR API error:', error);
      throw new BadRequestException(error.message || 'PayTR bağlantı hatası');
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
  async queryPaymentStatus(merchantOid: string): Promise<PayTRStatusInquiryResult> {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      this.logger.warn('PayTR status inquiry skipped: credentials missing');
      return { ok: false, errMsg: 'PayTR not configured' };
    }
    if (!merchantOid?.trim()) {
      return { ok: false, errMsg: 'merchant_oid required' };
    }

    const hashStr = this.merchantId + merchantOid + this.merchantSalt;
    const paytrToken = crypto
      .createHmac('sha256', this.merchantKey)
      .update(hashStr)
      .digest('base64');

    const formData = new URLSearchParams({
      merchant_id: this.merchantId,
      merchant_oid: merchantOid,
      paytr_token: paytrToken,
    });

    try {
      const response = await fetch('https://www.paytr.com/odeme/durum-sorgu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const rawText = await response.text();
      if (!rawText?.trim()) {
        this.logger.error(`PayTR durum-sorgu boş yanıt HTTP ${response.status}`);
        return { ok: false, errMsg: `Empty response HTTP ${response.status}` };
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        this.logger.error(`PayTR durum-sorgu JSON değil: ${rawText.slice(0, 200)}`);
        return { ok: false, errMsg: 'Invalid JSON from PayTR' };
      }

      const statusVal = (data.status ?? data.Status) as string | undefined;
      if (statusVal !== 'success') {
        return {
          ok: false,
          errNo: data.err_no != null ? String(data.err_no) : undefined,
          errMsg: String(data.err_msg ?? 'PayTR status inquiry failed'),
        };
      }

      const paymentTotalTl = PayTRService.parsePaytrMoneyString(
        (data.payment_total as string | undefined) ?? (data.PaymentTotal as string | undefined),
      );
      const paymentAmountTl = PayTRService.parsePaytrMoneyString(
        (data.payment_amount as string | undefined) ?? (data.PaymentAmount as string | undefined),
      );

      if (paymentTotalTl === null) {
        this.logger.warn(`PayTR durum-sorgu payment_total parse edilemedi: ${JSON.stringify(data)}`);
        return { ok: false, errMsg: 'Could not parse payment_total' };
      }
      const amountTl = paymentAmountTl ?? paymentTotalTl;

      const paymentDateRaw = data.payment_date ?? data.PaymentDate;
      const paymentDate =
        paymentDateRaw !== undefined && paymentDateRaw !== null
          ? String(paymentDateRaw)
          : undefined;

      const currency = String(data.currency ?? data.Currency ?? 'TL');

      return {
        ok: true,
        paymentTotalTl,
        paymentAmountTl: amountTl,
        paymentDate,
        currency,
      };
    } catch (error: any) {
      this.logger.error(`PayTR durum-sorgu hatası: ${error?.message}`);
      return { ok: false, errMsg: error?.message || 'PayTR status inquiry error' };
    }
  }

  /** PayTR dökümanındaki gibi ondalık ayırıcı virgül olabilir (örn. "10,8") */
  static parsePaytrMoneyString(value: string | undefined): number | null {
    if (value === undefined || value === null) return null;
    const s = String(value).trim().replace(/\s/g, '').replace(',', '.');
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
      .createHmac('sha256', this.merchantKey)
      .update(hashStr)
      .digest('base64');

    return callback.hash === expectedHash;
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
  } {
    return {
      orderId: callback.merchant_oid,
      isSuccess: callback.status === 'success',
      amount: parseInt(callback.total_amount, 10) / 100, // Convert from kuruş to TL
      errorCode: callback.failed_reason_code,
      errorMessage: callback.failed_reason_msg,
      paymentType: callback.payment_type,
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
    const oid = merchantOid.includes('-') ? merchantOid.replace(/-/g, '') : merchantOid;
    const returnAmount = Math.round(amount * 100); // Convert to kuruş

    // Build hash for refund
    const hashStr = `${this.merchantId}${oid}${returnAmount}${this.merchantSalt}`;
    const paytrToken = this.generateHash(hashStr);

    const formData = new URLSearchParams({
      merchant_id: this.merchantId,
      merchant_oid: oid,
      return_amount: String(returnAmount),
      paytr_token: paytrToken,
    });

    try {
      const response = await fetch('https://www.paytr.com/odeme/iade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data: PayTRRefundResponse = await response.json();

      if (data.status !== 'success') {
        throw new BadRequestException(data.err_msg || 'PayTR iade başarısız');
      }

      return data;
    } catch (error: any) {
      this.logger.error('PayTR refund error:', error);
      throw new BadRequestException(error.message || 'PayTR iade hatası');
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
  // INSTALLMENT CHECK
  // ==========================================================================

  /**
   * Get installment options for a BIN number
   */
  async getInstallmentOptions(
    binNumber: string,
    amount: number, // in TL
  ): Promise<{
    installments: Array<{
      count: number;
      totalAmount: number;
      monthlyAmount: number;
      rate: number;
    }>;
  }> {
    const paymentAmount = Math.round(amount * 100);
    const hashStr = `${this.merchantId}${binNumber.substring(0, 6)}${paymentAmount}${this.merchantSalt}`;
    const paytrToken = this.generateHash(hashStr);

    const formData = new URLSearchParams({
      merchant_id: this.merchantId,
      bin_number: binNumber.substring(0, 6),
      amount: String(paymentAmount),
      paytr_token: paytrToken,
    });

    try {
      const response = await fetch('https://www.paytr.com/odeme/api/bin-detail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = await response.json();

      if (data.status !== 'success') {
        throw new BadRequestException('Taksit bilgileri alınamadı');
      }

      // Parse installment options
      const installments = [];
      for (let i = 1; i <= 12; i++) {
        const key = `taksit${i}`;
        if (data[key]) {
          installments.push({
            count: i,
            totalAmount: parseFloat(data[key].total) / 100,
            monthlyAmount: parseFloat(data[key].monthly) / 100,
            rate: parseFloat(data[key].rate || '0'),
          });
        }
      }

      return { installments };
    } catch (error: any) {
      this.logger.error('PayTR installment check error:', error);
      throw new BadRequestException(error.message || 'Taksit bilgisi alınamadı');
    }
  }

  // ==========================================================================
  // DIRECT API PAYMENT (Alternative to iframe)
  // https://dev.paytr.com/direkt-api
  // ==========================================================================

  /**
   * PayTR Direkt API ile ödeme: kart bilgisi BİZİM sayfamızda alınır,
   * PayTR'ye sunucudan POST edilir. non_3d=0 (varsayılan) → yanıt, kullanıcıya
   * gösterilecek 3D Secure HTML sayfasıdır; banka doğrulaması sonrası PayTR
   * kullanıcıyı merchant_ok_url/merchant_fail_url'e yönlendirir ve sonucu
   * Bildirim URL'ine POST'lar (iframe akışıyla aynı callback/durum-sorgu).
   */
  async createDirectPayment(
    merchantOid: string,
    amount: number, // TL
    card: {
      number: string;
      expireMonth: string; // MM
      expireYear: string; // YY veya YYYY
      cvv: string;
      holderName: string;
    },
    buyer: PayTRBuyer,
    basketItems: PayTRBasketItem[],
    options?: {
      installmentCount?: number;
      non3d?: boolean;
      /** e.g. "paymentId=...&type=membership" — success sayfası verify için kullanır */
      successQueryParams?: string;
    },
  ): Promise<{ status: 'success'; threeDSHtml?: string }> {
    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      throw new BadRequestException('PayTR yapılandırılmamış (merchant bilgileri eksik)');
    }

    const paymentAmountStr = String(Math.round(amount * 100)); // kuruş
    const paymentType = 'card';
    // Tek çekim için '0' gönderilir (Direkt API kuralı)
    const installmentCount = String(
      options?.installmentCount && options.installmentCount > 1 ? options.installmentCount : 0,
    );
    const currency = 'TL';
    const testModeStr = this.testMode ? '1' : '0';
    const non3d = options?.non3d ? '1' : '0';

    const successBase = `${this.configService.get('FRONTEND_URL')}/payment/success`;
    const merchantOkUrl = options?.successQueryParams
      ? `${successBase}?${options.successQueryParams}`
      : successBase;
    const merchantFailUrl = `${this.configService.get('FRONTEND_URL')}/payment/fail`;

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
      .createHmac('sha256', this.merchantKey)
      .update(hashStr + this.merchantSalt)
      .digest('base64');

    const expiryYear2 = card.expireYear.length === 4 ? card.expireYear.slice(-2) : card.expireYear;
    // Direkt API basket: htmlEntities'li düz JSON (iframe'in base64'ünden farklı —
    // resmi PayTR Postman koleksiyonundaki pre-request script ile birebir)
    const basketJson = JSON.stringify(
      basketItems.map((item) => [item.name, (item.price * 100).toFixed(0), item.quantity]),
    );
    const userBasket = basketJson
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

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
      cc_owner: card.holderName,
      card_number: card.number.replace(/\s/g, ''),
      expiry_month: card.expireMonth.padStart(2, '0'),
      expiry_year: expiryYear2,
      cvv: card.cvv,
      merchant_ok_url: merchantOkUrl,
      merchant_fail_url: merchantFailUrl,
      user_name: `${buyer.name} ${buyer.surname}`.trim(),
      user_address: buyer.address,
      user_phone: buyer.phone,
      user_basket: userBasket,
      debug_on: this.testMode ? '1' : '0',
      client_lang: 'tr',
      // /odeme doğrulayıcısı bu alanları da zorunlu tutuyor (iframe ortak şeması)
      no_installment: '0',
      max_installment: '0',
      lang: 'tr',
      timeout_limit: '30',
    });

    let rawText: string;
    let httpStatus: number;
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      httpStatus = response.status;
      rawText = await response.text();
    } catch (error: any) {
      this.logger.error(`PayTR direct API connection error: ${error?.message}`);
      throw new BadRequestException('PayTR bağlantı hatası, lütfen tekrar deneyin.');
    }

    const trimmed = (rawText || '').trim();
    if (!trimmed) {
      this.logger.error(`PayTR direct API boş yanıt. HTTP ${httpStatus}`);
      throw new BadRequestException(`PayTR yanıt vermedi (HTTP ${httpStatus}).`);
    }

    // Hata yanıtları JSON'dır (bazen kısa bir HTML kabuğun İÇİNE gömülü gelir);
    // gerçek 3D yanıtı banka formunu içeren büyük bir HTML sayfasıdır.
    const embeddedError = trimmed.slice(0, 3000).match(/\{"status"\s*:\s*"failed".*?\}/);
    const jsonText = trimmed.startsWith('{') ? trimmed : embeddedError?.[0];
    if (jsonText) {
      let data: any;
      try {
        data = JSON.parse(jsonText);
      } catch {
        data = null;
      }
      if (data?.status === 'success') {
        // non_3d=1: çekim anında yapıldı; sonuç ayrıca Bildirim URL'ine düşer.
        return { status: 'success' };
      }
      let reason: string = data?.err_msg || data?.reason || 'PayTR ödemeyi reddetti';
      if (/paytr_token/i.test(reason)) {
        // Bu hata pratikte mağazada Direkt API yetkisinin tanımlı olmamasında da
        // dönüyor — istemci bu mesajla iframe akışına düşer.
        reason =
          'PayTR kart ödemesi bu mağaza için doğrulanamadı (Direkt API yetkisi gerekli olabilir).';
      }
      this.logger.warn(`PayTR direct API failed oid=${merchantOid}: ${data?.reason || reason}`);
      throw new BadRequestException(reason);
    }

    const lower = trimmed.slice(0, 500).toLowerCase();
    if (lower.includes('<html') || lower.includes('<!doctype') || lower.includes('<form')) {
      return { status: 'success', threeDSHtml: rawText };
    }

    this.logger.error(
      `PayTR direct API beklenmeyen yanıt oid=${merchantOid} HTTP ${httpStatus}: ${trimmed.slice(0, 300)}`,
    );
    throw new BadRequestException('PayTR beklenmeyen yanıt döndü; kart bilgilerinizi kontrol edin.');
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Encode basket items to Base64
   */
  private encodeBasket(items: PayTRBasketItem[]): string {
    const basketArray = items.map((item) => [
      item.name,
      (item.price * 100).toFixed(0), // Convert to kuruş
      item.quantity,
    ]);
    return Buffer.from(JSON.stringify(basketArray)).toString('base64');
  }

  /**
   * Generate HMAC-SHA256 hash in Base64 (refund, bin-detail; not iFrame get-token)
   */
  private generateHash(data: string): string {
    return crypto
      .createHmac('sha256', this.merchantKey)
      .update(data)
      .digest('base64');
  }

  // ==========================================================================
  // CONVENIENCE METHODS
  // ==========================================================================

  /**
   * Process order payment (high-level method)
   */
  async processOrderPayment(
    orderId: string,
    amount: number,
    buyer: {
      id: string;
      name: string;
      surname: string;
      email: string;
      phone: string;
      ip: string;
      address: string;
      city: string;
    },
    basketItems: Array<{
      id: string;
      name: string;
      category: string;
      price: number;
      quantity?: number;
    }>,
    installmentCount = 1,
    successQueryParams?: string,
  ): Promise<{ token: string; iframeUrl: string }> {
    const paytrBuyer: PayTRBuyer = {
      name: buyer.name,
      surname: buyer.surname,
      email: buyer.email,
      phone: buyer.phone,
      address: buyer.address,
      city: buyer.city,
      country: 'TR',
      ip: buyer.ip,
    };

    const paytrBasket: PayTRBasketItem[] = basketItems.map((item) => ({
      name: item.name,
      price: item.price,
      quantity: item.quantity || 1,
    }));

    return this.createIframeToken(orderId, amount, paytrBuyer, paytrBasket, {
      installmentCount,
      maxInstallment: 12,
      lang: 'tr',
      successQueryParams,
    });
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
    const submerchantAmountKurus = Math.round(params.submerchantAmount * 100).toString();
    const totalAmountKurus = Math.round(params.totalAmount * 100).toString();
    const oid = params.merchantOid.replace(/-/g, '');

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
      .createHmac('sha256', this.merchantKey)
      .update(hashStr)
      .digest('base64');

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
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: postData,
      });
      const parsed = await response.json();
      this.logger.log(
        `Platform transfer ${params.transId}: status=${parsed.status}${parsed.err_msg ? ` err=${parsed.err_msg}` : ''}`,
      );
      return parsed;
    } catch (error: any) {
      this.logger.error(`Platform transfer failed for ${params.transId}: ${error.message}`);
      throw new BadRequestException(
        `PayTR platform transfer başarısız: ${error.message}`,
      );
    }
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
      .createHmac('sha256', this.merchantKey)
      .update(hashStr)
      .digest('base64');

    const postData = new URLSearchParams({
      merchant_id: this.merchantId,
      start_date: params.startDate,
      end_date: params.endDate,
      paytr_token: paytrToken,
    }).toString();

    try {
      const response = await fetch('https://www.paytr.com/odeme/geri-donen-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: postData,
      });
      return await response.json();
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
      .createHmac('sha256', this.merchantKey)
      .update(hashStr)
      .digest('base64');

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
      const response = await fetch('https://www.paytr.com/odeme/hesaptan-gonder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: postData,
      });
      return await response.json();
    } catch (error: any) {
      this.logger.error(`Resend returned transfers failed: ${error.message}`);
      throw new BadRequestException(
        `PayTR hesaptan gönder başarısız: ${error.message}`,
      );
    }
  }

}
