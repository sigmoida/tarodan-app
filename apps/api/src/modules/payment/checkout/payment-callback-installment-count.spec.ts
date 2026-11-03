import * as crypto from "crypto";
import { Logger } from "@nestjs/common";
import { PaymentStatus, PaytrMerchant } from "@prisma/client";
import type { ConfigService } from "@nestjs/config";
import { PaymentCallbackService } from "./payment-callback.service";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PayTRCredentials } from "../../payment-providers/paytr/paytr-credentials.service";
import { PayTRReportService } from "../../payment-providers/paytr/paytr-report.service";
import { PayTRTransferService } from "../../payment-providers/paytr/paytr-transfer.service";
import { PayTRService } from "../../payment-providers/paytr/paytr.service";

/**
 * Critical paths 1 and 2: what a completed purchase hands to fulfillment as
 * its payment method, through the real PayTR parser (no mocked parse).
 *
 * - Verified callback (Direkt API 2. Adim): a live single payment arrives
 *   with `installment_count` "0", "1", "" or none; fulfillment gets 0, 1 or
 *   undefined (column 1 or untouched, pinned in
 *   `payment-fulfillment-provider-data.spec.ts`), never an installment.
 * - Hash-mismatch recovery: the durum-sorgu answer (`taksit`, `odeme_tipi`,
 *   `masked_pan`) reaches fulfillment through the same mapping, and the card
 *   number never reaches fulfillment or a log line.
 * PayTR is never called: `fetch` is mocked.
 */
const ENV: Record<string, string> = {
  PAYTR_MERCHANT_ID: "111111",
  PAYTR_MERCHANT_KEY: "market-key",
  PAYTR_MERCHANT_SALT: "market-salt",
  PAYTR_MEMBERSHIP_MERCHANT_ID: "222222",
  PAYTR_MEMBERSHIP_MERCHANT_KEY: "member-key",
  PAYTR_MEMBERSHIP_MERCHANT_SALT: "member-salt",
};

const OID = "ORD10001T123456";
const MASKED_PAN = "455359******6747";

const payment = {
  id: "pay-1",
  provider: "paytr",
  paytrMerchant: PaytrMerchant.marketplace,
  status: PaymentStatus.pending,
  amount: 199,
  orderId: "order-1",
  providerConversationId: OID,
  metadata: {},
  order: { buyerId: "user-1", status: "pending_payment" },
};

function signedCallback(extra: Record<string, string> = {}) {
  const body = { merchant_oid: OID, status: "success", total_amount: "19900" };
  // PayTR's callback hash covers oid, salt, status and total only:
  // installment_count is not signed.
  const hash = crypto
    .createHmac("sha256", "market-key")
    .update(`${body.merchant_oid}market-salt${body.status}${body.total_amount}`)
    .digest("base64");
  return { ...body, hash, ...extra };
}

function setup() {
  const config = {
    get: (key: string, fallback?: string) => ENV[key] ?? fallback,
  } as unknown as ConfigService;
  const creds = new PayTRCredentials(config);
  const paytr = new PayTRService(
    creds,
    new PayTRReportService(creds),
    new PayTRTransferService(creds),
    config,
  );
  const prisma = {
    payment: { findFirst: jest.fn().mockResolvedValue(payment) },
    membershipPayment: { findFirst: jest.fn().mockResolvedValue(null) },
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const fulfillment = {
    processSuccessfulPayment: jest.fn().mockResolvedValue(true),
    processFailedPayment: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new PaymentCallbackService(
    prisma as never,
    { get: () => undefined } as never,
    new PaymentProviderRegistry(paytr),
    { isChargeLikelyLive: () => false } as never,
    fulfillment as never,
    { syncSavedCardsFromUtoken: jest.fn() } as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    {
      incr: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue(undefined),
    } as never,
    {} as never,
  );
  return { svc, fulfillment };
}

describe("PaymentCallbackService: installment count reaching fulfillment", () => {
  let fetchSpy: jest.SpyInstance;
  let logSpies: jest.SpyInstance[];

  beforeEach(() => {
    fetchSpy = jest.spyOn(
      global,
      "fetch" as never,
    ) as unknown as jest.SpyInstance;
    logSpies = (["log", "warn", "error", "debug"] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    logSpies.forEach((spy) => spy.mockRestore());
  });

  const loggedText = () =>
    logSpies
      .flatMap((spy) => spy.mock.calls)
      .map((call) => call.map(String).join(" "))
      .join("\n");

  it.each([
    ["0", 0],
    ["1", 1],
    ["", undefined],
    [undefined, undefined],
    ["13", undefined],
  ])(
    "a verified callback with installment_count %p passes %p",
    async (installmentCount, expected) => {
      const { svc, fulfillment } = setup();
      const extra: Record<string, string> = {
        payment_type: "card",
        currency: "TL",
      };
      if (installmentCount !== undefined) {
        extra.installment_count = installmentCount;
      }

      await expect(
        svc.handlePayTRCallback(
          signedCallback(extra),
          PaytrMerchant.marketplace,
        ),
      ).resolves.toBe("OK");

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(fulfillment.processSuccessfulPayment).toHaveBeenCalledTimes(1);
      expect(fulfillment.processSuccessfulPayment).toHaveBeenCalledWith(
        payment,
        OID,
        OID,
        { paymentType: "card", installmentCount: expected, currency: "TL" },
      );
    },
  );

  it("hash-mismatch recovery passes the inquiry taksit and keeps the card number out", async () => {
    const { svc, fulfillment } = setup();
    fetchSpy.mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          status: "success",
          payment_total: "199,00",
          payment_amount: "199,00",
          currency: "TL",
          taksit: "0",
          odeme_tipi: "KART",
          kart_marka: "WORLD",
          masked_pan: MASKED_PAN,
        }),
    });

    await expect(
      svc.handlePayTRCallback(
        { ...signedCallback(), hash: "forged" },
        PaytrMerchant.marketplace,
      ),
    ).resolves.toBe("OK");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://www.paytr.com/odeme/durum-sorgu",
    );
    expect(fulfillment.processSuccessfulPayment).toHaveBeenCalledWith(
      payment,
      `paytr:${OID}`,
      OID,
      { paymentType: "card", installmentCount: 0, currency: "TL" },
    );
    const logged = loggedText();
    expect(logged).toContain("recovered via durum-sorgu");
    expect(logged).not.toContain("455359");
    expect(logged).not.toContain("6747");
  });
});
