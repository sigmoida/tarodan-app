import { BadRequestException, ConflictException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import {
  OrderOrigin,
  OrderStatus,
  PaymentStatus,
  PaytrMerchant,
  Prisma,
  SavedCardStatus,
} from "@prisma/client";
import { PaymentInitiationService } from "./payment-initiation.service";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PayTRCredentials } from "../../payment-providers/paytr/paytr-credentials.service";
import { PayTRReportService } from "../../payment-providers/paytr/paytr-report.service";
import { PayTRTransferService } from "../../payment-providers/paytr/paytr-transfer.service";
import { PayTRService } from "../../payment-providers/paytr/paytr.service";
import {
  singleChargeQuote,
  type ChargeQuote,
  type ChargeQuoteInput,
} from "../installments/installment-charge.service";

/**
 * `POST /payments/direct-form` with an installment (ADR 0019, plan 5.1 step
 * 4): the form is signed with the charge quote's C and count, `card_type` is
 * the quoted family, the basket gets the fee line, and the quote is stored as
 * the oid's charge attempt inside the claim transaction. Signed by the real
 * PayTR client; the token is recomputed here from the documented formula.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const ENV: Record<string, string> = {
  PAYTR_MERCHANT_ID: "111111",
  PAYTR_MERCHANT_KEY: "market-key",
  PAYTR_MERCHANT_SALT: "market-salt",
  PAYTR_TEST_MODE: "true",
  PAYTR_CARD_STORAGE_ENABLED: "true",
  FRONTEND_URL: "https://app.test",
};

function realRegistry() {
  const config = {
    get: (key: string, fallback?: string) => ENV[key] ?? fallback,
  } as unknown as ConfigService;
  const creds = new PayTRCredentials(config);
  return new PaymentProviderRegistry(
    new PayTRService(
      creds,
      new PayTRReportService(creds),
      new PayTRTransferService(creds),
      config,
    ),
  );
}

const THREE_QUOTE: ChargeQuote = {
  ...singleChargeQuote(D("1000.00"), "free"),
  installmentCount: 3,
  feeAmount: D("66.38"),
  chargedAmount: D("1066.38"),
  singleRatePct: D("3"),
  installmentRatePct: D("8"),
  card: {
    family: "world",
    bank: "Test Bank",
    type: "credit",
    businessCard: false,
  },
  bin6: "454671",
  rateSnapshotId: "snap-1",
};

function setup(
  opts: {
    quote?: ChargeQuote | Error;
    claimCount?: number;
    guest?: boolean;
    savedCard?: boolean;
  } = {},
) {
  const order = {
    id: "order-1",
    orderNumber: "ORD-K7X9M2QF3N",
    buyerId: "buyer-1",
    productId: "prod-1",
    origin: OrderOrigin.offer,
    checkoutGroupId: null,
    status: OrderStatus.pending_payment,
    paymentExpiresAt: null,
    reservationReleasedAt: null,
    totalAmount: D("1000.00"),
    shippingAddress: opts.guest
      ? { isGuestOrder: true, guestEmail: "g@test.local", fullName: "G T" }
      : {},
    buyer: { id: "buyer-1", displayName: "Ada L", email: "ada@test.local" },
    product: { id: "prod-1", title: "Model car" },
  };
  const existingPayment = {
    id: "pay-1",
    orderId: "order-1",
    checkoutGroupId: null,
    amount: D("1000.00"),
    provider: "paytr",
    status: PaymentStatus.pending,
    providerConversationId: null,
    metadata: null,
    paytrMerchant: PaytrMerchant.marketplace,
    isTest: false,
  };
  const calls: string[] = [];
  const prisma = {
    order: { findUnique: jest.fn(async () => order) },
    payment: {
      findUnique: jest.fn(async (args: { select?: unknown }) =>
        args.select
          ? { orderId: "order-1", checkoutGroupId: null }
          : existingPayment,
      ),
      updateMany: jest.fn(async (args: { data: { status?: string } }) => {
        calls.push(
          args.data.status === PaymentStatus.processing
            ? "payment.claim"
            : "payment.release",
        );
        return { count: opts.claimCount ?? 1 };
      }),
      findUniqueOrThrow: jest.fn(async () => ({
        ...existingPayment,
        status: PaymentStatus.processing,
      })),
    },
    paymentChargeAttempt: {
      create: jest.fn(async () => {
        calls.push("attempt.create");
        return {};
      }),
    },
    savedCard: {
      findFirst: jest.fn(async () =>
        opts.savedCard
          ? {
              id: "card-1",
              utoken: "UT1",
              ctoken: "CT1",
              requireCvv: false,
              status: SavedCardStatus.active,
            }
          : null,
      ),
    },
    $queryRaw: jest.fn(async () => [{ status: OrderStatus.pending_payment }]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    async (fn: (tx: unknown) => unknown) => {
      calls.push("tx.begin");
      const result = await fn(prisma);
      calls.push("tx.commit");
      return result;
    },
  );
  const quoteCharge = jest.fn(async (input: ChargeQuoteInput) => {
    if (opts.quote instanceof Error) throw opts.quote;
    return opts.quote ?? singleChargeQuote(input.targetTotal, "free");
  });
  const events = { record: jest.fn() };
  const service = new PaymentInitiationService(
    prisma as never,
    { get: (k: string) => ENV[k] } as never,
    realRegistry(),
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    events as never,
    { ensureForPayment: jest.fn().mockResolvedValue(null) } as never,
    { isRecordedForOrder: jest.fn().mockResolvedValue(true) } as never,
    { quoteCharge } as never,
  );
  return { service, prisma, quoteCharge, events, calls };
}

const fieldsOf = (form: { fields: Array<{ name: string; value: string }> }) =>
  Object.fromEntries(form.fields.map((f) => [f.name, f.value]));

const tokenOf = (f: Record<string, string>) =>
  crypto
    .createHmac("sha256", ENV.PAYTR_MERCHANT_KEY)
    .update(
      ENV.PAYTR_MERCHANT_ID +
        f.user_ip +
        f.merchant_oid +
        f.email +
        f.payment_amount +
        f.payment_type +
        f.installment_count +
        f.currency +
        f.test_mode +
        f.non_3d +
        ENV.PAYTR_MERCHANT_SALT,
    )
    .digest("base64");

const SELECTION = { count: 3, bin: "45467112", expectedTotal: 1066.38 };

describe("PaymentInitiationService.prepareDirectPayment — installments", () => {
  it("signs C and the count, sends card_type and the fee basket line, and stores the attempt in the claim transaction", async () => {
    const { service, prisma, quoteCharge, calls } = setup({
      quote: THREE_QUOTE,
    });

    const form = await service.prepareDirectPayment("buyer-1", {
      orderId: "order-1",
      installment: SELECTION,
    });
    const f = fieldsOf(form);

    expect(quoteCharge).toHaveBeenCalledWith({
      paymentId: "pay-1",
      targetTotal: D("1000.00"),
      paytrMerchant: PaytrMerchant.marketplace,
      selection: SELECTION,
      savedCardId: undefined,
      userId: "buyer-1",
    });
    expect(f.payment_amount).toBe("1066.38");
    expect(f.installment_count).toBe("3");
    expect(f.card_type).toBe("world");
    expect(f.paytr_token).toBe(tokenOf(f));
    expect(JSON.parse(f.user_basket)).toEqual([
      ["Model car", "1000.00", 1],
      ["Taksit vade farkı", "66.38", 1],
    ]);

    // The attempt is written after the claim, in the same transaction.
    expect(calls).toEqual([
      "tx.begin",
      "payment.claim",
      "attempt.create",
      "tx.commit",
      // The form is signed; the claim goes back to pending for the callback.
      "payment.release",
    ]);
    const claim = prisma.payment.updateMany.mock.calls[0][0] as unknown as {
      data: { providerConversationId: string; paytrMerchant: PaytrMerchant };
    };
    expect(prisma.paymentChargeAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentId: "pay-1",
        merchantOid: claim.data.providerConversationId,
        paytrMerchant: claim.data.paytrMerchant,
        installmentCount: 3,
        baseAmount: D("1000.00"),
        installmentFeeAmount: D("66.38"),
        chargedAmount: D("1066.38"),
        buyerSegment: "free",
        cardFamily: "world",
        bin6: "454671",
        rateSnapshotId: "snap-1",
      }),
    });
    expect(f.merchant_oid).toBe(claim.data.providerConversationId);
  });

  it("keeps an old client's form exactly as a single payment, with a count-1 attempt", async () => {
    const { service, prisma } = setup();

    const form = await service.prepareDirectPayment("buyer-1", {
      orderId: "order-1",
    });
    const f = fieldsOf(form);

    expect(f.payment_amount).toBe("1000.00");
    expect(f.installment_count).toBe("0");
    expect(f).not.toHaveProperty("card_type");
    expect(JSON.parse(f.user_basket)).toEqual([["Model car", "1000.00", 1]]);
    expect(f.paytr_token).toBe(tokenOf(f));
    expect(prisma.paymentChargeAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installmentCount: 1,
        chargedAmount: D("1000.00"),
        installmentFeeAmount: D("0"),
      }),
    });
  });

  it("signs a saved-card installment with the saved tokens", async () => {
    const { service, quoteCharge } = setup({
      quote: { ...THREE_QUOTE, bin6: null, savedCardId: "card-1" },
      savedCard: true,
    });

    const form = await service.prepareDirectPayment("buyer-1", {
      orderId: "order-1",
      savedCardId: "card-1",
      installment: { count: 3, expectedTotal: 1066.38 },
    });
    const f = fieldsOf(form);

    expect(quoteCharge).toHaveBeenCalledWith(
      expect.objectContaining({ savedCardId: "card-1", userId: "buyer-1" }),
    );
    expect(f.utoken).toBe("UT1");
    expect(f.installment_count).toBe("3");
    expect(f.payment_amount).toBe("1066.38");
    expect(f.card_type).toBe("world");
  });

  it("prices a guest's installment through the payment capability (no user)", async () => {
    const { service, quoteCharge } = setup({
      quote: { ...THREE_QUOTE, segment: "guest" },
      guest: true,
    });

    const form = await service.prepareDirectPayment(
      null,
      { orderId: "order-1", paymentId: "pay-1", installment: SELECTION },
      undefined,
      true,
    );

    expect(quoteCharge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, selection: SELECTION }),
    );
    expect(fieldsOf(form).installment_count).toBe("3");
  });

  it.each`
    refusal
    ${new BadRequestException({ i18nKey: "server.payment.installmentNotOffered" })}
    ${new ConflictException({ i18nKey: "server.payment.installmentPricingChanged" })}
    ${new ConflictException({ i18nKey: "server.payment.installmentUnavailable" })}
  `(
    "refuses before the claim ($refusal.status): no claim, no attempt",
    async ({ refusal }) => {
      const { service, prisma } = setup({ quote: refusal });
      await expect(
        service.prepareDirectPayment("buyer-1", {
          orderId: "order-1",
          installment: SELECTION,
        }),
      ).rejects.toBe(refusal);
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(prisma.paymentChargeAttempt.create).not.toHaveBeenCalled();
    },
  );

  it("writes no attempt when a concurrent request holds the claim (double submit)", async () => {
    const { service, prisma } = setup({ quote: THREE_QUOTE, claimCount: 0 });
    await expect(
      service.prepareDirectPayment("buyer-1", {
        orderId: "order-1",
        installment: SELECTION,
      }),
    ).rejects.toMatchObject({
      status: 400,
      response: { i18nKey: "server.payment.paymentCurrentlyProcessing" },
    });
    expect(prisma.paymentChargeAttempt.create).not.toHaveBeenCalled();
  });
});
