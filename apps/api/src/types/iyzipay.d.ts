declare module 'iyzipay' {
  interface IyzipayConfig {
    apiKey: string;
    secretKey: string;
    uri: string;
  }

  interface CheckoutFormInitializeRequest {
    locale?: string;
    conversationId?: string;
    price: string;
    paidPrice: string;
    currency?: string;
    basketId: string;
    paymentGroup?: string;
    callbackUrl: string;
    enabledInstallments?: number[];
    buyer?: any;
    shippingAddress?: any;
    billingAddress?: any;
    basketItems: any[];
  }

  interface CheckoutFormInitializeResponse {
    status: 'success' | 'failure';
    errorCode?: string;
    errorMessage?: string;
    locale?: string;
    systemTime?: number;
    conversationId?: string;
    checkoutFormContent?: string;
    paymentPageUrl?: string;
    token?: string;
    tokenExpireTime?: number;
  }

  interface CheckoutFormRetrieveRequest {
    token: string;
  }

  interface CheckoutFormRetrieveResponse {
    status: 'success' | 'failure';
    errorCode?: string;
    errorMessage?: string;
    locale?: string;
    systemTime?: number;
    conversationId?: string;
    paymentId?: string;
    paymentStatus?: string;
    fraudStatus?: number;
    price?: number;
    paidPrice?: number;
    currency?: string;
    installment?: number;
    basketId?: string;
    itemTransactions?: any[];
  }

  interface RefundRequest {
    locale?: string;
    conversationId?: string;
    paymentTransactionId: string;
    price: string;
    currency?: string;
    ip?: string;
  }

  interface CancelRequest {
    locale?: string;
    conversationId?: string;
    paymentId: string;
    ip?: string;
  }

  interface InstallmentInfoRequest {
    locale?: string;
    conversationId?: string;
    binNumber: string;
    price: string;
  }

  type Callback<T> = (err: any, result: T) => void;

  class Iyzipay {
    static LOCALE: {
      TR: string;
      EN: string;
    };
    static CURRENCY: {
      TRY: string;
      EUR: string;
      USD: string;
      GBP: string;
    };
    static PAYMENT_GROUP: {
      PRODUCT: string;
      LISTING: string;
      SUBSCRIPTION: string;
    };
    static BASKET_ITEM_TYPE: {
      PHYSICAL: string;
      VIRTUAL: string;
    };

    constructor(config: IyzipayConfig);

    checkoutFormInitialize: {
      create(request: CheckoutFormInitializeRequest, callback: Callback<CheckoutFormInitializeResponse>): void;
    };

    checkoutForm: {
      retrieve(request: CheckoutFormRetrieveRequest, callback: Callback<CheckoutFormRetrieveResponse>): void;
    };

    refund: {
      create(request: RefundRequest, callback: Callback<any>): void;
    };

    cancel: {
      create(request: CancelRequest, callback: Callback<any>): void;
    };

    installmentInfo: {
      retrieve(request: InstallmentInfoRequest, callback: Callback<any>): void;
    };
  }

  export = Iyzipay;
}
