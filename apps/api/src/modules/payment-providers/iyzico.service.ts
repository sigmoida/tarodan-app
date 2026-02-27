import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Iyzipay = require('iyzipay');

// =============================================================================
// IYZICO SERVICE - Using Official iyzipay Package
// =============================================================================

@Injectable()
export class IyzicoService {
  private readonly logger = new Logger(IyzicoService.name);
  private readonly iyzipay: any;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get('IYZICO_API_KEY', '');
    const secretKey = this.configService.get('IYZICO_SECRET_KEY', '');
    const baseUrl = this.configService.get(
      'IYZICO_BASE_URL',
      'https://sandbox-api.iyzipay.com',
    );

    // Check for valid credentials (not empty and not placeholder values)
    const placeholders = ['your-iyzico-api-key-here', 'your-iyzico-secret-key-here', 'sandbox-test-api-key', 'sandbox-test-secret-key'];
    const hasValidApiKey = apiKey && !placeholders.includes(apiKey);
    const hasValidSecretKey = secretKey && !placeholders.includes(secretKey);
    this.isConfigured = !!(hasValidApiKey && hasValidSecretKey);

    if (this.isConfigured) {
      this.iyzipay = new Iyzipay({
        apiKey,
        secretKey,
        uri: baseUrl,
      });
      this.logger.log(`✅ Iyzico service initialized (apiKey: ${apiKey.substring(0, 6)}..., baseUrl: ${baseUrl})`);
    } else {
      this.logger.warn('⚠️ Iyzico API credentials not configured or using placeholder values. Payment will be unavailable.');
      this.logger.warn('Get real sandbox credentials from: https://sandbox-merchant.iyzipay.com/');
    }
  }

  /**
   * Initialize checkout form (recommended for web payments)
   */
  async initializeCheckoutForm(request: {
    locale: string;
    conversationId: string;
    price: string;
    paidPrice: string;
    currency: string;
    basketId: string;
    paymentGroup: string;
    callbackUrl: string;
    enabledInstallments?: number[];
    buyer: {
      id: string;
      name: string;
      surname: string;
      gsmNumber?: string;
      email: string;
      identityNumber: string;
      registrationAddress: string;
      ip: string;
      city: string;
      country: string;
    };
    shippingAddress: {
      contactName: string;
      city: string;
      country: string;
      address: string;
      zipCode?: string;
    };
    billingAddress: {
      contactName: string;
      city: string;
      country: string;
      address: string;
      zipCode?: string;
    };
    basketItems: Array<{
      id: string;
      name: string;
      category1: string;
      itemType: 'PHYSICAL' | 'VIRTUAL';
      price: string;
    }>;
  }): Promise<{
    status: 'success' | 'failure';
    errorCode?: string;
    errorMessage?: string;
    checkoutFormContent?: string;
    paymentPageUrl?: string;
    token?: string;
    tokenExpireTime?: number;
  }> {
    if (!this.isConfigured) {
      throw new BadRequestException('iyzico yapılandırılmamış');
    }

    this.logger.log('Initializing checkout form');

    return new Promise((resolve, reject) => {
      this.iyzipay.checkoutFormInitialize.create(request, (err: any, result: any) => {
        if (err) {
          this.logger.error('Iyzico checkout form init error');
          reject(new BadRequestException(err.message || 'iyzico bağlantı hatası'));
          return;
        }

        if (result.status === 'failure') {
          this.logger.warn(`Iyzico checkout form failed: errorCode=${result.errorCode}, errorMessage=${result.errorMessage}, errorGroup=${result.errorGroup}`);
          reject(new BadRequestException(result.errorMessage || 'iyzico işlemi başarısız'));
          return;
        }

        resolve(result);
      });
    });
  }

  /**
   * Retrieve checkout form result (after callback)
   */
  async retrieveCheckoutForm(token: string): Promise<{
    status: 'success' | 'failure';
    errorCode?: string;
    errorMessage?: string;
    paymentId?: string;
    paymentStatus?: string;
    fraudStatus?: number;
    price?: number;
    paidPrice?: number;
    currency?: string;
    installment?: number;
    basketId?: string;
    itemTransactions?: Array<{
      itemId: string;
      paymentTransactionId: string;
      transactionStatus: number;
      price: number;
      paidPrice: number;
    }>;
  }> {
    if (!this.isConfigured) {
      throw new BadRequestException('iyzico yapılandırılmamış');
    }

    this.logger.log('Retrieving checkout form result');

    return new Promise((resolve, reject) => {
      this.iyzipay.checkoutForm.retrieve({ token }, (err: any, result: any) => {
        if (err) {
          this.logger.error('Iyzico retrieve checkout form error');
          reject(new BadRequestException(err.message || 'iyzico bağlantı hatası'));
          return;
        }

        if (result.status === 'failure') {
          this.logger.warn('Iyzico checkout result failure');
        }

        resolve(result);
      });
    });
  }

  /**
   * Create refund
   */
  async createRefund(request: {
    paymentTransactionId: string;
    price: string;
    currency?: string;
    ip?: string;
  }): Promise<{
    status: 'success' | 'failure';
    errorCode?: string;
    errorMessage?: string;
    paymentId?: string;
    paymentTransactionId?: string;
    price?: number;
  }> {
    if (!this.isConfigured) {
      throw new BadRequestException('iyzico yapılandırılmamış');
    }

    const refundRequest = {
      locale: Iyzipay.LOCALE?.TR || 'tr',
      conversationId: `REFUND-${Date.now()}`,
      paymentTransactionId: request.paymentTransactionId,
      price: request.price,
      currency: request.currency || Iyzipay.CURRENCY?.TRY || 'TRY',
      ip: request.ip || '127.0.0.1',
    };

    this.logger.log('Creating refund');

    return new Promise((resolve, reject) => {
      this.iyzipay.refund.create(refundRequest, (err: any, result: any) => {
        if (err) {
          this.logger.error('Iyzico refund error');
          reject(new BadRequestException(err.message || 'iyzico iade hatası'));
          return;
        }

        if (result.status === 'failure') {
          reject(new BadRequestException(result.errorMessage || 'İade işlemi başarısız'));
          return;
        }

        resolve(result);
      });
    });
  }

  /**
   * Check installment options
   */
  async checkInstallment(
    binNumber: string,
    price: number,
  ): Promise<{
    status: 'success' | 'failure';
    installmentDetails?: Array<{
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
    if (!this.isConfigured) {
      throw new BadRequestException('iyzico yapılandırılmamış');
    }

    const request = {
      locale: Iyzipay.LOCALE?.TR || 'tr',
      conversationId: `INSTALLMENT-${Date.now()}`,
      binNumber: binNumber.substring(0, 6),
      price: price.toFixed(2),
    };

    return new Promise((resolve, reject) => {
      this.iyzipay.installmentInfo.retrieve(request, (err: any, result: any) => {
        if (err) {
          this.logger.error('Iyzico installment check error');
          reject(new BadRequestException(err.message || 'Taksit sorgulama hatası'));
          return;
        }

        resolve(result);
      });
    });
  }

  /**
   * Cancel payment
   */
  async cancelPayment(request: {
    paymentId: string;
    ip?: string;
  }): Promise<{
    status: 'success' | 'failure';
    errorCode?: string;
    errorMessage?: string;
  }> {
    if (!this.isConfigured) {
      throw new BadRequestException('iyzico yapılandırılmamış');
    }

    const cancelRequest = {
      locale: Iyzipay.LOCALE?.TR || 'tr',
      conversationId: `CANCEL-${Date.now()}`,
      paymentId: request.paymentId,
      ip: request.ip || '127.0.0.1',
    };

    this.logger.log('Cancelling payment');

    return new Promise((resolve, reject) => {
      this.iyzipay.cancel.create(cancelRequest, (err: any, result: any) => {
        if (err) {
          this.logger.error('Iyzico cancel error');
          reject(new BadRequestException(err.message || 'İptal hatası'));
          return;
        }

        if (result.status === 'failure') {
          reject(new BadRequestException(result.errorMessage || 'İptal işlemi başarısız'));
          return;
        }

        resolve(result);
      });
    });
  }

  /**
   * Create partial refund (for backwards compatibility)
   */
  async createPartialRefund(
    paymentTransactionId: string,
    amount: number,
    ip: string,
  ): Promise<{
    status: 'success' | 'failure';
    errorCode?: string;
    errorMessage?: string;
    paymentId?: string;
    paymentTransactionId?: string;
    price?: number;
  }> {
    return this.createRefund({
      paymentTransactionId,
      price: amount.toFixed(2),
      ip,
    });
  }
  /**
   * Initialize 3D Secure Payment (Direct API)
   */
  async initialize3DSecure(request: {
    locale: string;
    conversationId: string;
    price: string;
    paidPrice: string;
    currency: string;
    installment: number;
    basketId: string;
    paymentGroup: string;
    callbackUrl: string;
    paymentCard?: {
      cardHolderName: string;
      cardNumber: string;
      expireMonth: string;
      expireYear: string;
      cvc: string;
      registerCard?: number; // 0 or 1
    };
    cardUserKey?: string; // For stored cards
    cardToken?: string; // For stored cards
    buyer: {
      id: string;
      name: string;
      surname: string;
      gsmNumber?: string;
      email: string;
      identityNumber: string;
      registrationAddress: string;
      ip: string;
      city: string;
      country: string;
    };
    shippingAddress: {
      contactName: string;
      city: string;
      country: string;
      address: string;
      zipCode?: string;
    };
    billingAddress: {
      contactName: string;
      city: string;
      country: string;
      address: string;
      zipCode?: string;
    };
    basketItems: Array<{
      id: string;
      name: string;
      category1: string;
      itemType: 'PHYSICAL' | 'VIRTUAL';
      price: string;
    }>;
  }): Promise<{
    status: 'success' | 'failure';
    errorCode?: string;
    errorMessage?: string;
    paymentId?: string;
    conversationId?: string;
    htmlContent?: string; // 3D Secure HTML content
    threeDSHtmlContent?: string; // Alternative property name from Iyzico
  }> {
    if (!this.isConfigured) {
      throw new BadRequestException('iyzico yapılandırılmamış');
    }

    this.logger.log('Initializing 3D Secure payment');

    return new Promise((resolve, reject) => {
      this.iyzipay.threedsInitialize.create(request, (err: any, result: any) => {
        if (err) {
          this.logger.error('Iyzico 3DS init error');
          reject(new BadRequestException(err.message || 'iyzico bağlantı hatası'));
          return;
        }

        if (result.status === 'failure') {
          this.logger.warn(`Iyzico 3DS failed: errorCode=${result.errorCode}, errorMessage=${result.errorMessage}, errorGroup=${result.errorGroup}`);
          this.logger.warn(`Iyzico 3DS full response: ${JSON.stringify({ status: result.status, errorCode: result.errorCode, errorMessage: result.errorMessage, errorGroup: result.errorGroup, locale: result.locale, systemTime: result.systemTime, conversationId: result.conversationId })}`);
          reject(new BadRequestException(result.errorMessage || 'Ödeme başlatılamadı'));
          return;
        }

        resolve(result);
      });
    });
  }

  /**
   * Complete 3D Secure Payment (Auth)
   */
  async complete3DSecure(request: {
    paymentId: string;
    conversationId?: string;
    conversationData?: string;
  }): Promise<{
    status: 'success' | 'failure';
    paymentId?: string;
    paymentStatus?: string;
    errorCode?: string;
    errorMessage?: string;
    price?: number;
    paidPrice?: number;
  }> {
    if (!this.isConfigured) {
      throw new BadRequestException('iyzico yapılandırılmamış');
    }

    this.logger.log('Completing 3D Secure payment (Auth)');

    return new Promise((resolve, reject) => {
      this.iyzipay.threedsPayment.create({
        locale: Iyzipay.LOCALE?.TR || 'tr',
        conversationId: request.conversationId,
        paymentId: request.paymentId,
        conversationData: request.conversationData,
      }, (err: any, result: any) => {
        if (err) {
          this.logger.error('Iyzico 3DS complete error');
          reject(new BadRequestException(err.message || 'Ödeme tamamlama hatası'));
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Add Card to Storage
   */
  async addCard(request: {
    locale?: string;
    conversationId?: string;
    email: string; // Used as cardUserKey identifier (or verify with Iyzico pattern)
    cardUserKey?: string;
    card: {
      cardAlias: string;
      cardHolderName: string;
      cardNumber: string;
      expireMonth: string;
      expireYear: string;
    };
  }): Promise<{
    status: 'success' | 'failure';
    cardUserKey?: string;
    cardToken?: string;
    cardAlias?: string;
    binNumber?: string;
    errorCode?: string;
    errorMessage?: string;
  }> {
    if (!this.isConfigured) {
      throw new BadRequestException('iyzico yapılandırılmamış');
    }

    const payload = {
      locale: request.locale || 'tr',
      conversationId: request.conversationId || `ADD-CARD-${Date.now()}`,
      email: request.email,
      cardUserKey: request.cardUserKey,
      card: request.card,
    };

    return new Promise((resolve, reject) => {
      this.iyzipay.card.create(payload, (err: any, result: any) => {
        if (err) {
          reject(new BadRequestException(err.message || 'Kart saklama hatası'));
          return;
        }
        if (result.status === 'failure') {
          reject(new BadRequestException(result.errorMessage || 'Kart saklanamadı'));
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Delete Card from Storage
   */
  async deleteCard(request: {
    cardUserKey: string;
    cardToken: string;
  }): Promise<{ status: 'success' | 'failure' }> {
    if (!this.isConfigured) {
      throw new BadRequestException('iyzico yapılandırılmamış');
    }

    return new Promise((resolve, reject) => {
      this.iyzipay.card.delete({
        locale: 'tr',
        conversationId: `DEL-CARD-${Date.now()}`,
        cardUserKey: request.cardUserKey,
        cardToken: request.cardToken,
      }, (err: any, result: any) => {
        if (err) {
          reject(new BadRequestException(err.message));
          return;
        }
        if (result.status === 'failure') {
          reject(new BadRequestException(result.errorMessage));
          return;
        }
        resolve(result);
      });
    });
  }

  /**
   * Get Stored Cards
   */
  async getCards(cardUserKey: string): Promise<{
    status: 'success' | 'failure';
    cardUserKey?: string;
    cardDetails?: Array<{
      cardToken: string;
      cardAlias: string;
      binNumber: string;
      lastFourDigits: string;
      cardType: string;
      cardAssociation: string;
      cardFamily: string;
    }>;
  }> {
    if (!this.isConfigured) {
      throw new BadRequestException('iyzico yapılandırılmamış');
    }

    return new Promise((resolve, reject) => {
      this.iyzipay.cardList.retrieve({
        locale: 'tr',
        conversationId: `LIST-CARDS-${Date.now()}`,
        cardUserKey: cardUserKey,
      }, (err: any, result: any) => {
        if (err) {
          reject(new BadRequestException(err.message));
          return;
        }
        if (result.status === 'failure') {
          // If user key not found, return empty list instead of specific error
          if (result.errorCode === '5157') {
            resolve({ status: 'success', cardDetails: [] });
            return;
          }
          reject(new BadRequestException(result.errorMessage));
          return;
        }
        resolve(result);
      });
    });
  }
}
