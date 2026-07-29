import type {
  PayTRBuyer,
  PayTRBasketItem,
  PayTRCallbackData,
  PayTRRefundResponse,
  PayTRStatusInquiryResult,
} from "./paytr.service";

/**
 * #89: the payment-provider contract. Money-path consumers depend on this
 * interface + {@link PaymentProviderRegistry} (resolve by provider key) instead
 * of the concrete `PayTRService`, so a second PSP can be introduced and tests can
 * stub the provider (see `StubPaymentProvider`).
 *
 * Scope note: with a single live provider, this surface mirrors PayTR's public
 * API — including PayTR-proprietary card-vault (`capi*`) methods — and reuses
 * PayTR's DTO types. When a second provider lands, split the generic money-path
 * methods from provider-specific capabilities and generalise the DTOs. `implements
 * IPaymentProvider` on `PayTRService` guarantees this stays in sync in the meantime.
 */
export interface IPaymentProvider {
  /** Stable key used to resolve this provider; matches `Payment.provider`. */
  readonly key: string;

  queryPaymentStatus(merchantOid: string): Promise<PayTRStatusInquiryResult>;

  verifyCallback(callback: PayTRCallbackData): boolean;

  parseCallback(callback: PayTRCallbackData): {
    orderId: string;
    isSuccess: boolean;
    amount: number;
    errorCode?: string;
    errorMessage?: string;
    paymentType?: string;
    installmentCount?: number;
    currency?: string;
    paymentAmount?: number;
    testMode?: boolean;
  };

  createRefund(
    merchantOid: string,
    amount: number,
  ): Promise<PayTRRefundResponse>;

  createDirectPaymentForm(
    merchantOid: string,
    amount: number,
    buyer: PayTRBuyer,
    basketItems: PayTRBasketItem[],
    options?: {
      installmentCount?: number;
      successQueryParams?: string;
      storeCard?: boolean;
      utoken?: string;
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
  }>;

  chargeRecurring(params: {
    utoken: string;
    ctoken: string;
    amount: number;
    merchantOid: string;
    buyer: PayTRBuyer;
    basketItems: PayTRBasketItem[];
    cvv?: string;
  }): Promise<{
    status: "success" | "failed" | "wait_callback";
    reason?: string;
    tryAgain?: boolean;
    raw?: Record<string, unknown>;
  }>;

  /** Kayıtlı kartla kullanıcı-mevcut (CIT) ödeme — recurring DEĞİL. */
  capiPaymentByRegisteredCard(params: {
    utoken: string;
    ctoken: string;
    amount: number;
    merchantOid: string;
    buyer: PayTRBuyer;
    basketItems: PayTRBasketItem[];
    requireCvv?: boolean;
    cvv?: string;
    installmentCount?: number;
    non3d?: boolean;
    successQueryParams?: string;
  }): Promise<{
    status: "success" | "failed" | "wait_callback";
    reason?: string;
    tryAgain?: boolean;
    threeDSHtml?: string;
    raw?: Record<string, unknown>;
  }>;

  capiListCards(utoken: string): Promise<
    Array<{
      ctoken: string;
      last4: string;
      requireCvv: boolean;
      month?: string;
      year?: string;
      brand?: string;
      type?: string;
      schema?: string;
      bank?: string;
      businessCard?: boolean;
    }>
  >;

  capiDeleteCard(
    utoken: string,
    ctoken: string,
  ): Promise<{ status: string; reason?: string }>;

  createPlatformTransfer(params: {
    merchantOid: string;
    transId: string;
    submerchantAmount: number;
    totalAmount: number;
    transferName: string;
    transferIban: string;
  }): Promise<{ status: string; err_no?: string; err_msg?: string }>;

  getReturnedTransfers(params: {
    startDate: string;
    endDate: string;
  }): Promise<any>;
}

/** Canonical provider keys (matches `Payment.provider`). */
export const PAYMENT_PROVIDER_PAYTR = "paytr";
