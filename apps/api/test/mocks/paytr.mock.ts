import * as crypto from "crypto";
import type {
  PayTRBuyer,
  PayTRBasketItem,
  PayTRCallbackData,
  PayTRStatusInquiryResult,
} from "../../src/modules/payment-providers/paytr/paytr.service";

/**
 * In-memory PayTR mock for E2E tests.
 *
 * Method signatures match the real PayTRService — when overridden via
 * Test.overrideProvider(PayTRService).useValue(mock) the rest of the app
 * sees the same shape.
 *
 * verifyCallback() preserves the real hash check (uses the same secret/salt
 * as .env.test) so callback security paths stay covered. parseCallback() is
 * delegated to the same logic as production.
 */

const MERCHANT_KEY = "test-key";
const MERCHANT_SALT = "test-salt";

export class MockPayTRService {
  public readonly key = "paytr";
  public readonly iframeCalls: Array<{ orderId: string; amount: number }> = [];
  public readonly refundCalls: Array<{
    merchantOid: string;
    refundAmount: number;
  }> = [];
  public readonly transferCalls: Array<{
    merchantOid: string;
    transId: string;
    submerchantAmount: number;
    totalAmount: number;
    transferName: string;
    transferIban: string;
  }> = [];
  public readonly queryResults = new Map<string, PayTRStatusInquiryResult>();
  /** Set to true to make next createPlatformTransfer return error */
  public nextTransferFails = false;
  /** Set to true to make next createRefund throw (gerçek PayTRService gibi) — retry testleri için */
  public nextRefundFails = false;

  // ── CAPI / recurring (kart saklama) mock durumu ──
  public readonly recurringCalls: Array<{
    utoken: string;
    ctoken: string;
    amount: number;
    merchantOid: string;
  }> = [];
  /** Kayıtlı-karttan-ödeme (CIT) çağrıları — interaktif kayıtlı kart yolu buraya düşer. */
  public readonly registeredCardCalls: Array<{
    utoken: string;
    ctoken: string;
    amount: number;
    merchantOid: string;
    requireCvv?: boolean;
    cvv?: string;
  }> = [];
  public readonly capiDeleteCalls: Array<{ utoken: string; ctoken: string }> =
    [];
  public readonly directPaymentCalls: Array<{
    merchantOid: string;
    amount: number;
    storeCard?: boolean;
    utoken?: string;
    savedCard?: {
      utoken: string;
      ctoken: string;
      requireCvv: boolean;
    };
  }> = [];
  /** Sonraki chargeRecurring sonucu (test kontrolü). null → success. */
  public nextRecurringResult: {
    status: "success" | "failed" | "wait_callback";
    reason?: string;
    tryAgain?: boolean;
  } | null = null;
  /** Sonraki capiPaymentByRegisteredCard sonucu (test kontrolü). null → success. */
  public nextRegisteredCardResult: {
    status: "success" | "failed" | "wait_callback";
    reason?: string;
    tryAgain?: boolean;
    threeDSHtml?: string;
  } | null = null;
  /** capiListCards için utoken→kart listesi (test seti). */
  public readonly storedCardsByUtoken = new Map<
    string,
    Array<{
      ctoken: string;
      last4: string;
      requireCvv: boolean;
      month?: string;
      year?: string;
      brand?: string;
      type?: string;
      schema?: string;
    }>
  >();

  setStoredCards(
    utoken: string,
    cards: Array<{
      ctoken: string;
      last4: string;
      requireCvv?: boolean;
      month?: string;
      year?: string;
      brand?: string;
    }>,
  ): void {
    this.storedCardsByUtoken.set(
      utoken,
      cards.map((c) => ({ requireCvv: false, ...c })),
    );
  }

  setQueryResult(merchantOid: string, result: PayTRStatusInquiryResult): void {
    this.queryResults.set(merchantOid, result);
  }

  async createIframeToken(
    orderId: string,
    amount: number,
    _buyer: PayTRBuyer,
    _basketItems: PayTRBasketItem[],
    _options?: unknown,
  ): Promise<{ token: string; iframeUrl: string }> {
    this.iframeCalls.push({ orderId, amount });
    return {
      token: `mock-token-${orderId}`,
      iframeUrl: `https://mock.paytr.test/iframe/${orderId}`,
    };
  }

  /** Wrapper that mirrors the real PayTRService.processOrderPayment signature. */
  async processOrderPayment(
    orderId: string,
    amount: number,
    _buyer: unknown,
    _basket: unknown,
    _installmentCount?: number,
    _successQueryParams?: string,
  ): Promise<{ token: string; iframeUrl: string }> {
    return this.createIframeToken(
      orderId,
      amount,
      {} as PayTRBuyer,
      [] as PayTRBasketItem[],
    );
  }

  async queryPaymentStatus(
    merchantOid: string,
  ): Promise<PayTRStatusInquiryResult> {
    return (
      this.queryResults.get(merchantOid) ?? {
        ok: false,
        errNo: "mock-not-set",
        errMsg: "Test did not set query result for this merchantOid",
      }
    );
  }

  verifyCallback(callback: PayTRCallbackData): boolean {
    const hashStr = `${callback.merchant_oid}${MERCHANT_SALT}${callback.status}${callback.total_amount}`;
    const expectedHash = crypto
      .createHmac("sha256", MERCHANT_KEY)
      .update(hashStr)
      .digest("base64");
    return callback.hash === expectedHash;
  }

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
      isSuccess: callback.status === "success",
      amount: parseInt(callback.total_amount, 10) / 100,
      errorCode: callback.failed_reason_code,
      errorMessage: callback.failed_reason_msg,
      paymentType: callback.payment_type,
    };
  }

  async createRefund(
    merchantOid: string,
    refundAmount: number,
  ): Promise<{ status: string; mock: true }> {
    this.refundCalls.push({ merchantOid, refundAmount });
    if (this.nextRefundFails) {
      this.nextRefundFails = false;
      // Gerçek PayTRService non-success'te throw eder; mock da aynısını yapsın.
      throw new Error("Mock refund failure");
    }
    return { status: "success", mock: true };
  }

  async createPartialRefund(
    merchantOid: string,
    refundAmount: number,
  ): Promise<{ status: string; mock: true }> {
    this.refundCalls.push({ merchantOid, refundAmount });
    return { status: "success", mock: true };
  }

  async createPlatformTransfer(params: {
    merchantOid: string;
    transId: string;
    submerchantAmount: number;
    totalAmount: number;
    transferName: string;
    transferIban: string;
  }): Promise<{ status: string; err_no?: string; err_msg?: string }> {
    this.transferCalls.push(params);
    if (this.nextTransferFails) {
      this.nextTransferFails = false;
      return {
        status: "error",
        err_no: "099",
        err_msg: "Mock transfer failure",
      };
    }
    return { status: "success" };
  }

  async getReturnedTransfers(_params: {
    startDate: string;
    endDate: string;
  }): Promise<any> {
    return { status: "success", data: [] };
  }

  async resendReturnedTransfers(_params: {
    transId: string;
    transfers: any[];
  }): Promise<any> {
    return { status: "success" };
  }

  async chargeRecurring(params: {
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
  }> {
    this.recurringCalls.push({
      utoken: params.utoken,
      ctoken: params.ctoken,
      amount: params.amount,
      merchantOid: params.merchantOid,
    });
    if (this.nextRecurringResult) {
      const r = this.nextRecurringResult;
      this.nextRecurringResult = null;
      return r;
    }
    return { status: "success" };
  }

  async capiPaymentByRegisteredCard(params: {
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
  }> {
    this.registeredCardCalls.push({
      utoken: params.utoken,
      ctoken: params.ctoken,
      amount: params.amount,
      merchantOid: params.merchantOid,
      requireCvv: params.requireCvv,
      cvv: params.cvv,
    });
    if (this.nextRegisteredCardResult) {
      const r = this.nextRegisteredCardResult;
      this.nextRegisteredCardResult = null;
      return r;
    }
    return { status: "success" };
  }

  async createDirectPaymentForm(
    merchantOid: string,
    amount: number,
    _buyer: PayTRBuyer,
    _basketItems: PayTRBasketItem[],
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
  }> {
    this.directPaymentCalls.push({
      merchantOid,
      amount,
      storeCard: options?.storeCard,
      utoken: options?.utoken,
      savedCard: options?.savedCard,
    });
    return {
      action: "https://www.paytr.com/odeme",
      method: "POST",
      fields: [
        { name: "merchant_oid", value: merchantOid },
        ...(options?.storeCard ? [{ name: "store_card", value: "1" }] : []),
        ...(options?.utoken ? [{ name: "utoken", value: options.utoken }] : []),
        ...(options?.savedCard
          ? [
              { name: "utoken", value: options.savedCard.utoken },
              { name: "ctoken", value: options.savedCard.ctoken },
              {
                name: "require_cvv",
                value: options.savedCard.requireCvv ? "1" : "0",
              },
            ]
          : []),
      ],
      requireCvv: options?.savedCard?.requireCvv ?? false,
    };
  }

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
    }>
  > {
    // No `requireCvv: false` default here: a stored card always carries the
    // flag, so the spread overwrote it every time and the default never applied.
    return (this.storedCardsByUtoken.get(utoken) ?? []).map((c) => ({ ...c }));
  }

  async capiDeleteCard(
    utoken: string,
    ctoken: string,
  ): Promise<{ status: string; reason?: string }> {
    this.capiDeleteCalls.push({ utoken, ctoken });
    const cards = this.storedCardsByUtoken.get(utoken);
    if (cards)
      this.storedCardsByUtoken.set(
        utoken,
        cards.filter((c) => c.ctoken !== ctoken),
      );
    return { status: "success" };
  }

  reset(): void {
    this.iframeCalls.length = 0;
    this.refundCalls.length = 0;
    this.transferCalls.length = 0;
    this.queryResults.clear();
    this.nextTransferFails = false;
    this.nextRefundFails = false;
    this.recurringCalls.length = 0;
    this.registeredCardCalls.length = 0;
    this.capiDeleteCalls.length = 0;
    this.directPaymentCalls.length = 0;
    this.nextRecurringResult = null;
    this.nextRegisteredCardResult = null;
    this.storedCardsByUtoken.clear();
  }
}

/**
 * Build a callback body whose hash will pass `verifyCallback` against the
 * .env.test merchant key/salt. Use this in tests to simulate PayTR webhook.
 */
export function signCallback(input: {
  merchantOid: string;
  status: "success" | "failed";
  totalAmount: number; // kuruş
  paymentAmount?: number;
  /** CAPI store_card ödemesinde PayTR bildirimle utoken döndürür (hash'e dahil DEĞİL). */
  utoken?: string;
}): PayTRCallbackData {
  const totalAmountStr = String(input.totalAmount);
  const hashStr = `${input.merchantOid}${MERCHANT_SALT}${input.status}${totalAmountStr}`;
  const hash = crypto
    .createHmac("sha256", MERCHANT_KEY)
    .update(hashStr)
    .digest("base64");
  return {
    merchant_oid: input.merchantOid,
    status: input.status,
    total_amount: totalAmountStr,
    payment_amount: String(input.paymentAmount ?? input.totalAmount),
    hash,
    payment_type: "card",
    currency: "TL",
    test_mode: "1",
    merchant_id: "test-merchant",
    ...(input.utoken ? { utoken: input.utoken } : {}),
  } as PayTRCallbackData;
}
