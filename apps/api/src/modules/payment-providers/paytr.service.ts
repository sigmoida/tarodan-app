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
    this.merchantId = this.configService.get('PAYTR_MERCHANT_ID', '');
    this.merchantKey = this.configService.get('PAYTR_MERCHANT_KEY', '');
    this.merchantSalt = this.configService.get('PAYTR_MERCHANT_SALT', '');
    this.baseUrl = 'https://www.paytr.com/odeme';
    this.testMode = this.configService.get('PAYTR_TEST_MODE', 'true') === 'true';

    if (!this.merchantId || !this.merchantKey || !this.merchantSalt) {
      this.logger.warn('⚠️ PayTR API credentials not configured');
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

    // Encode basket
    const userBasket = this.encodeBasket(basketItems);

    // Build hash string
    const hashStr = this.buildHashString({
      merchantOid: orderId,
      email: buyer.email,
      paymentAmount,
      userBasket,
      noInstallment: options?.installmentCount === 1 ? '1' : '0',
      maxInstallment: String(options?.maxInstallment || 0),
      currency: 'TL',
      testMode: this.testMode ? '1' : '0',
    });

    // Generate PayTR token
    const paytrToken = this.generateHash(hashStr);

    // Build request data
    const formData = new URLSearchParams({
      merchant_id: this.merchantId,
      user_ip: buyer.ip,
      merchant_oid: orderId,
      email: buyer.email,
      payment_amount: String(paymentAmount),
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: this.testMode ? '1' : '0',
      no_installment: options?.installmentCount === 1 ? '1' : '0',
      max_installment: String(options?.maxInstallment || 0),
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
    const returnAmount = Math.round(amount * 100); // Convert to kuruş

    // Build hash for refund
    const hashStr = `${this.merchantId}${merchantOid}${returnAmount}${this.merchantSalt}`;
    const paytrToken = this.generateHash(hashStr);

    const formData = new URLSearchParams({
      merchant_id: this.merchantId,
      merchant_oid: merchantOid,
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
  // ==========================================================================

  /**
   * Create direct API payment (requires PCI DSS compliance)
   * Note: Most merchants should use iframe method instead
   */
  async createDirectPayment(
    orderId: string,
    amount: number,
    card: {
      number: string;
      expireMonth: string;
      expireYear: string;
      cvv: string;
      holderName: string;
    },
    buyer: PayTRBuyer,
    basketItems: PayTRBasketItem[],
    options?: {
      installmentCount?: number;
      is3D?: boolean;
    },
  ): Promise<{
    status: 'success' | 'failed';
    paymentId?: string;
    threeDSUrl?: string;
    errorMessage?: string;
  }> {
    const paymentAmount = Math.round(amount * 100);
    const userBasket = this.encodeBasket(basketItems);

    // Build hash
    const hashStr = this.buildHashString({
      merchantOid: orderId,
      email: buyer.email,
      paymentAmount,
      userBasket,
      noInstallment: options?.installmentCount === 1 ? '1' : '0',
      maxInstallment: String(options?.installmentCount || 0),
      currency: 'TL',
      testMode: this.testMode ? '1' : '0',
    });
    const paytrToken = this.generateHash(hashStr);

    const formData = new URLSearchParams({
      merchant_id: this.merchantId,
      user_ip: buyer.ip,
      merchant_oid: orderId,
      email: buyer.email,
      payment_type: 'card',
      payment_amount: String(paymentAmount),
      currency: 'TL',
      test_mode: this.testMode ? '1' : '0',
      non_3d: options?.is3D === false ? '1' : '0',
      cc_owner: card.holderName,
      card_number: card.number,
      expiry_month: card.expireMonth,
      expiry_year: card.expireYear,
      cvv: card.cvv,
      installment_count: String(options?.installmentCount || 0),
      user_name: `${buyer.name} ${buyer.surname}`,
      user_address: buyer.address,
      user_phone: buyer.phone,
      user_basket: userBasket,
      paytr_token: paytrToken,
      merchant_ok_url: `${this.configService.get('FRONTEND_URL')}/payment/success`,
      merchant_fail_url: `${this.configService.get('FRONTEND_URL')}/payment/fail`,
    });

    try {
      const response = await fetch('https://www.paytr.com/odeme/api/direct-payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = await response.json();

      if (data.status === 'success') {
        return {
          status: 'success',
          paymentId: data.payment_id,
        };
      } else if (data.status === '3d') {
        return {
          status: 'success',
          threeDSUrl: data.redirect_url,
        };
      } else {
        return {
          status: 'failed',
          errorMessage: data.reason || 'Ödeme başarısız',
        };
      }
    } catch (error: any) {
      this.logger.error('PayTR direct payment error:', error);
      throw new BadRequestException(error.message || 'PayTR ödeme hatası');
    }
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
   * Build hash string for token generation
   */
  private buildHashString(params: {
    merchantOid: string;
    email: string;
    paymentAmount: number;
    userBasket: string;
    noInstallment: string;
    maxInstallment: string;
    currency: string;
    testMode: string;
  }): string {
    return (
      this.merchantId +
      params.email +
      params.paymentAmount +
      params.userBasket +
      params.noInstallment +
      params.maxInstallment +
      params.currency +
      params.testMode +
      this.merchantSalt
    );
  }

  /**
   * Generate HMAC-SHA256 hash in Base64
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
}
