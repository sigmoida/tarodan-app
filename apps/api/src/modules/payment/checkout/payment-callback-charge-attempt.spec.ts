import * as crypto from "crypto";
import { Logger } from "@nestjs/common";
import { PaymentStatus, PaytrMerchant, Prisma } from "@prisma/client";
import type { ConfigService } from "@nestjs/config";
import { PaymentCallbackService } from "./payment-callback.service";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PayTRCredentials } from "../../payment-providers/paytr/paytr-credentials.service";
import { PayTRReportService } from "../../payment-providers/paytr/paytr-report.service";
import { PayTRTransferService } from "../../payment-providers/paytr/paytr-transfer.service";
import { PayTRService } from "../../payment-providers/paytr/paytr.service";

/**
 * Critical path 2 (callback integrity) with charge attempts (ADR 0019, plan
 * 5.6): a verified success callback is checked against the amount signed for
 * ITS oid. A late callback of an older attempt (the buyer paid the first
 * form, then a second form was signed) is checked against its own C, and a
 * callback reporting T where C was signed is not completed. Real PayTR hash
 * check; PayTR is never called.
 */
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ENV: Record<string, string> = {
  PAYTR_MERCHANT_ID: "111111",
  PAYTR_MERCHANT_KEY: "market-key",
  PAYTR_MERCHANT_SALT: "market-salt",
};

const OLD_OID = "ORD10001A111111"; // 3 installments, superseded
const NEW_OID = "ORD10001B222222"; // single payment, current

const payment = {
  id: "pay-1",
  provider: "paytr",
  paytrMerchant: PaytrMerchant.marketplace,
  status: PaymentStatus.pending,
  amount: D("1000.00"),
  chargedAmount: null,
  orderId: "order-1",
  providerConversationId: NEW_OID,
  metadata: { merchantOidHistory: [OLD_OID] },
  order: { buyerId: "user-1", status: "pending_payment" },
};

const attempts = [
  {
    id: "att-old",
    paymentId: "pay-1",
    merchantOid: OLD_OID,
    installmentCount: 3,
    chargedAmount: D("1066.38"),
  },
  {
    id: "att-new",
    paymentId: "pay-1",
    merchantOid: NEW_OID,
    installmentCount: 1,
    chargedAmount: D("1000.00"),
  },
];

function signedCallback(oid: string, totalKurus: string) {
  const body = {
    merchant_oid: oid,
    status: "success",
    total_amount: totalKurus,
  };
  const hash = crypto
    .createHmac("sha256", ENV.PAYTR_MERCHANT_KEY)
    .update(`${oid}${ENV.PAYTR_MERCHANT_SALT}success${totalKurus}`)
    .digest("base64");
  return { ...body, hash, payment_type: "card" };
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
    paymentChargeAttempt: {
      findFirst: jest.fn(
        async ({
          where,
        }: {
          where: { merchantOid: string; paymentId: string };
        }) =>
          attempts.find(
            (a) =>
              a.merchantOid === where.merchantOid &&
              a.paymentId === where.paymentId,
          ) ?? null,
      ),
    },
    payment: {
      findFirst: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          // Current oid by providerConversationId, an older one by history.
          where.OR || where.metadata ? payment : null,
      ),
    },
    membershipPayment: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const fulfillment = {
    processSuccessfulPayment: jest.fn().mockResolvedValue(true),
    processFailedPayment: jest.fn(),
  };
  const svc = new PaymentCallbackService(
    prisma as never,
    { get: () => undefined } as never,
    new PaymentProviderRegistry(paytr),
    { isChargeLikelyLive: () => false } as never,
    fulfillment as never,
    { syncSavedCardsFromUtoken: jest.fn() } as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    {} as never,
    {} as never,
  );
  return { svc, fulfillment, prisma };
}

describe("PaymentCallbackService: the amount of the oid's charge attempt", () => {
  let errorLog: jest.SpyInstance;
  beforeEach(() => {
    errorLog = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("completes a late callback of a superseded installment attempt at its own C", async () => {
    const { svc, fulfillment, prisma } = setup();

    await expect(
      svc.handlePayTRCallback(signedCallback(OLD_OID, "106638")),
    ).resolves.toBe("OK");

    expect(prisma.paymentChargeAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { merchantOid: OLD_OID, paymentId: "pay-1" },
      }),
    );
    // Captured on the oid that was charged (the capture links its attempt).
    expect(fulfillment.processSuccessfulPayment).toHaveBeenCalledWith(
      payment,
      OLD_OID,
      OLD_OID,
      expect.anything(),
    );
  });

  it("does not complete an installment attempt whose callback reports T instead of C", async () => {
    const { svc, fulfillment } = setup();

    await svc.handlePayTRCallback(signedCallback(OLD_OID, "100000"));

    expect(fulfillment.processSuccessfulPayment).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining(
        "INSTALLMENT_CALLBACK_AMOUNT_MISMATCH payment=pay-1 merchant_oid=ORD10001A111111: expected 106638 kuruş, received 100000",
      ),
    );
  });

  it("checks the current single attempt against T", async () => {
    const { svc, fulfillment } = setup();

    await svc.handlePayTRCallback(signedCallback(NEW_OID, "106638"));
    expect(fulfillment.processSuccessfulPayment).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("PAYTR_CALLBACK_AMOUNT_MISMATCH payment=pay-1"),
    );

    await svc.handlePayTRCallback(signedCallback(NEW_OID, "100000"));
    expect(fulfillment.processSuccessfulPayment).toHaveBeenCalledTimes(1);
  });

  it("keeps a form signed before attempts on the legacy amount", async () => {
    const { svc, fulfillment, prisma } = setup();
    prisma.paymentChargeAttempt.findFirst.mockResolvedValue(null);

    await svc.handlePayTRCallback(signedCallback(NEW_OID, "100000"));

    expect(fulfillment.processSuccessfulPayment).toHaveBeenCalledTimes(1);
  });
});
