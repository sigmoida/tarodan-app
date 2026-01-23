import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

// =============================================================================
// IYZICO API TYPES
// =============================================================================

export interface IyzicoAddress {
  contactName: string;
  city: string;
  country: string;
  address: string;
  zipCode?: string;
}

export interface IyzicoBuyer {
  id: string;
  name: string;
  surname: string;
  gsmNumber?: string;
  email: string;
  identityNumber: string;
  lastLoginDate?: string;
  registrationDate?: string;
  registrationAddress: string;
  ip: string;
  city: string;
  country: string;
  zipCode?: string;
}

export interface IyzicoBasketItem {
  id: string;
  name: string;
  category1: string;
  category2?: string;
  itemType: 'PHYSICAL' | 'VIRTUAL';
  price: string;
}

export interface IyzicoPaymentRequest {
  locale: string;
  conversationId: string;
  price: string;
  paidPrice: string;
  currency: string;
  installment: number;
  basketId: string;
  paymentChannel: string;
  paymentGroup: string;
  paymentCard: {
    cardHolderName: string;
    cardNumber: string;
    expireMonth: string;
    expireYear: string;
    cvc: string;
    registerCard?: string;
  };
  buyer: IyzicoBuyer;
  shippingAddress: IyzicoAddress;
  billingAddress: IyzicoAddress;
  basketItems: IyzicoBasketItem[];
}

export interface IyzicoPaymentResponse {
  status: 'success' | 'failure';
  errorCode?: string;
  errorMessage?: string;
  locale: string;
  systemTime: number;
  conversationId: string;
  price: number;
  paidPrice: number;
  installment: number;
  paymentId: string;
  fraudStatus: number;
  merchantCommissionRate: number;
  merchantCommissionRateAmount: number;
  iyziCommissionRateAmount: number;
  iyziCommissionFee: number;
  cardType: string;
  cardAssociation: string;
  cardFamily: string;
  binNumber: string;
  lastFourDigits: string;
  basketId: string;
  currency: string;
  itemTransactions: Array<{
    itemId: string;
    paymentTransactionId: string;
    transactionStatus: number;
    price: number;
    paidPrice: number;
    merchantCommissionRate: number;
    merchantCommissionRateAmount: number;
    iyziCommissionRateAmount: number;
    iyziCommissionFee: number;
    blockageRate: number;
    blockageRateAmountMerchant: number;
    blockageRateAmountSubMerchant: number;
    blockageResolvedDate: string;
    subMerchantPrice: number;
    subMerchantPayoutRate: number;
    subMerchantPayoutAmount: number;
    merchantPayoutAmount: number;
  }>;
}

export interface IyzicoRefundRequest {
  locale: string;
  conversationId: string;
  paymentTransactionId: string;
  price: string;
  currency: string;
  ip: string;
}

export interface IyzicoRefundResponse {
  status: 'success' | 'failure';
  errorCode?: string;
  errorMessage?: string;
  locale: string;
  systemTime: number;
  conversationId: string;
  paymentId: string;
  paymentTransactionId: string;
  price: number;
  currency: string;
}

export interface IyzicoCheckoutFormInitializeRequest {
  locale: string;
  conversationId: string;
  price: string;
  paidPrice: string;
  currency: string;
  basketId: string;
  paymentGroup: string;
  callbackUrl: string;
  enabledInstallments?: number[];
  buyer?: IyzicoBuyer;
  shippingAddress?: IyzicoAddress;
  billingAddress?: IyzicoAddress;
  basketItems: IyzicoBasketItem[];
}

export interface IyzicoCheckoutFormInitializeResponse {
  status: 'success' | 'failure';
  errorCode?: string;
  errorMessage?: string;
  locale: string;
  systemTime: number;
  conversationId: string;
  checkoutFormContent?: string;
  paymentPageUrl?: string;
  token?: string;
  tokenExpireTime?: number;
}

export interface IyzicoCheckoutFormResult {
  status: 'success' | 'failure';
  errorCode?: string;
  errorMessage?: string;
  locale: string;
  systemTime: number;
  conversationId: string;
  paymentId?: string;
  paymentStatus?: string;
  fraudStatus?: number;
  itemTransactions?: Array<{
    itemId: string;
    paymentTransactionId: string;
    transactionStatus: number;
    price: number;
    paidPrice: number;
  }>;
}

// =============================================================================
// IYZICO SERVICE
// =============================================================================

@Injectable()
export class IyzicoService {
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get('IYZICO_API_KEY', '');
    this.secretKey = this.configService.get('IYZICO_SECRET_KEY', '');
    this.baseUrl = this.configService.get(
      'IYZICO_BASE_URL',
      'https://sandbox-api.iyzipay.com',
    );

    if (!this.apiKey || !this.secretKey) {
      console.warn('⚠️ iyzico API credentials not configured');
    }
  }

  // ==========================================================================
  // PAYMENT
  // ==========================================================================

  /**
   * Create payment
   */
  async createPayment(request: IyzicoPaymentRequest): Promise<IyzicoPaymentResponse> {
    const endpoint = '/payment/auth';
    return this.makeRequest<IyzicoPaymentResponse>(endpoint, request);
  }

  /**
   * Initialize checkout form (recommended for web payments)
   */
  async initializeCheckoutForm(
    request: IyzicoCheckoutFormInitializeRequest,
  ): Promise<IyzicoCheckoutFormInitializeResponse> {
    const endpoint = '/payment/iyzipos/checkoutform/initialize/auth';
    return this.makeRequest<IyzicoCheckoutFormInitializeResponse>(endpoint, request);
  }

  /**
   * Retrieve checkout form result (after callback)
   */
  async retrieveCheckoutForm(token: string): Promise<IyzicoCheckoutFormResult> {
    const endpoint = '/payment/iyzipos/checkoutform/auth';
    return this.makeRequest<IyzicoCheckoutFormResult>(endpoint, { token });
  }

  /**
   * Create payment (3D Secure)
   */
  async create3DPayment(
    request: IyzicoPaymentRequest,
    callbackUrl: string,
  ): Promise<{ threeDSHtmlContent: string }> {
    const endpoint = '/payment/3dsecure/initialize';
    const requestWithCallback = {
      ...request,
      callbackUrl,
    };
    return this.makeRequest(endpoint, requestWithCallback);
  }

  /**
   * Complete 3D Secure payment
   */
  async complete3DPayment(paymentId: string): Promise<IyzicoPaymentResponse> {
    const endpoint = '/payment/3dsecure/auth';
    return this.makeRequest<IyzicoPaymentResponse>(endpoint, { paymentId });
  }

  // ==========================================================================
  // REFUND
  // ==========================================================================

  /**
   * Create refund
   */
  async createRefund(request: IyzicoRefundRequest): Promise<IyzicoRefundResponse> {
    const endpoint = '/payment/refund';
    return this.makeRequest<IyzicoRefundResponse>(endpoint, request);
  }

  /**
   * Create partial refund
   */
  async createPartialRefund(
    paymentTransactionId: string,
    amount: number,
    ip: string,
  ): Promise<IyzicoRefundResponse> {
    const request: IyzicoRefundRequest = {
      locale: 'tr',
      conversationId: `REFUND-${Date.now()}`,
      paymentTransactionId,
      price: amount.toFixed(2),
      currency: 'TRY',
      ip,
    };
    return this.createRefund(request);
  }

  // ==========================================================================
  // INSTALLMENT CHECK
  // ==========================================================================

  /**
   * Check installment options
   */
  async checkInstallment(
    binNumber: string,
    price: number,
  ): Promise<{
    installmentDetails: Array<{
      binNumber: string;
      cardType: string;
      cardAssociation: string;
      cardFamilyName: string;
      installmentPrices: Array<{
        installmentNumber: number;
        price: number;
        totalPrice: number;
      }>;
    }>;
  }> {
    const endpoint = '/payment/iyzipos/installment';
    const request = {
      locale: 'tr',
      conversationId: `INSTALLMENT-${Date.now()}`,
      binNumber: binNumber.substring(0, 6),
      price: price.toFixed(2),
    };
    return this.makeRequest(endpoint, request);
  }

  // ==========================================================================
  // SUB-MERCHANT (for marketplace payouts)
  // ==========================================================================

  /**
   * Create sub-merchant (seller)
   */
  async createSubMerchant(
    sellerId: string,
    sellerName: string,
    iban: string,
    address: string,
    email: string,
    gsmNumber?: string,
  ): Promise<any> {
    const endpoint = '/onboarding/submerchant';
    const request = {
      locale: 'tr',
      conversationId: `SUBMERCHANT-${Date.now()}`,
      subMerchantExternalId: sellerId,
      subMerchantType: 'PERSONAL',
      address,
      contactName: sellerName,
      contactSurname: sellerName,
      email,
      gsmNumber,
      name: sellerName,
      iban,
      identityNumber: '00000000000', // Should be real TC Kimlik No
      currency: 'TRY',
    };
    return this.makeRequest(endpoint, request);
  }

  /**
   * Update sub-merchant
   */
  async updateSubMerchant(
    subMerchantKey: string,
    data: Partial<{
      address: string;
      iban: string;
      gsmNumber: string;
      email: string;
    }>,
  ): Promise<any> {
    const endpoint = '/onboarding/submerchant';
    const request = {
      locale: 'tr',
      conversationId: `SUBMERCHANT-UPDATE-${Date.now()}`,
      subMerchantKey,
      ...data,
    };
    return this.makeRequest(endpoint, request, 'PUT');
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Make API request
   */
  private async makeRequest<T>(
    endpoint: string,
    body: any,
    method: 'POST' | 'PUT' = 'POST',
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const requestString = JSON.stringify(body);
    const randomString = this.generateRandomString();
    const hashString = this.generateHashString(randomString, body);

    const headers = {
      'Content-Type': 'application/json',
      Authorization: this.generateAuthorizationHeader(randomString, hashString),
      'x-iyzi-rnd': randomString,
    };

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: requestString,
      });

      const data = await response.json();

      if (data.status === 'failure') {
        throw new BadRequestException(
          data.errorMessage || 'iyzico işlemi başarısız',
        );
      }

      return data as T;
    } catch (error: any) {
      console.error('iyzico API error:', error);
      throw new BadRequestException(
        error.message || 'iyzico bağlantı hatası',
      );
    }
  }

  /**
   * Generate random string for request
   */
  private generateRandomString(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Generate hash string for authentication
   */
  private generateHashString(randomString: string, body: any): string {
    const hashStr = randomString + JSON.stringify(body);
    return crypto.createHash('sha1').update(hashStr).digest('base64');
  }

  /**
   * Generate authorization header
   */
  private generateAuthorizationHeader(
    randomString: string,
    hashString: string,
  ): string {
    const authorizationString = `${this.apiKey}&${randomString}&${this.secretKey}&${hashString}`;
    const authorization = crypto
      .createHash('sha1')
      .update(authorizationString)
      .digest('base64');
    return `IYZWS ${this.apiKey}:${authorization}`;
  }

  // ==========================================================================
  // CONVENIENCE METHODS
  // ==========================================================================

  /**
   * Create simple payment (for orders)
   */
  async processOrderPayment(
    orderId: string,
    amount: number,
    buyerInfo: {
      id: string;
      name: string;
      surname: string;
      email: string;
      phone?: string;
      ip: string;
      address: string;
      city: string;
    },
    cardInfo: {
      holderName: string;
      number: string;
      expireMonth: string;
      expireYear: string;
      cvc: string;
    },
    basketItems: Array<{
      id: string;
      name: string;
      category: string;
      price: number;
    }>,
    installment = 1,
  ): Promise<IyzicoPaymentResponse> {
    const request: IyzicoPaymentRequest = {
      locale: 'tr',
      conversationId: orderId,
      price: amount.toFixed(2),
      paidPrice: amount.toFixed(2),
      currency: 'TRY',
      installment,
      basketId: orderId,
      paymentChannel: 'WEB',
      paymentGroup: 'PRODUCT',
      paymentCard: {
        cardHolderName: cardInfo.holderName,
        cardNumber: cardInfo.number,
        expireMonth: cardInfo.expireMonth,
        expireYear: cardInfo.expireYear,
        cvc: cardInfo.cvc,
      },
      buyer: {
        id: buyerInfo.id,
        name: buyerInfo.name,
        surname: buyerInfo.surname,
        gsmNumber: buyerInfo.phone,
        email: buyerInfo.email,
        identityNumber: '00000000000',
        registrationAddress: buyerInfo.address,
        ip: buyerInfo.ip,
        city: buyerInfo.city,
        country: 'Turkey',
      },
      shippingAddress: {
        contactName: `${buyerInfo.name} ${buyerInfo.surname}`,
        city: buyerInfo.city,
        country: 'Turkey',
        address: buyerInfo.address,
      },
      billingAddress: {
        contactName: `${buyerInfo.name} ${buyerInfo.surname}`,
        city: buyerInfo.city,
        country: 'Turkey',
        address: buyerInfo.address,
      },
      basketItems: basketItems.map((item) => ({
        id: item.id,
        name: item.name,
        category1: item.category,
        itemType: 'PHYSICAL' as const,
        price: item.price.toFixed(2),
      })),
    };

    return this.createPayment(request);
  }
}
