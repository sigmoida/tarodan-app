import { Logger } from "@nestjs/common";
import {
  BusinessStatus,
  MembershipTierType,
  OrderOrigin,
  PaytrMerchant,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import type { DirectFormInstallmentSelection } from "@tarodan/types";
import {
  InstallmentChargeService,
  chargeAttemptCreateData,
  type ChargeQuoteInput,
} from "./installment-charge.service";
import { InstallmentOptionsService } from "./installment-options.service";
import type { InstallmentRuleCandidate } from "./installment-rules";

/**
 * Signing an installment charge (ADR 0019, plan 5.1 step 4 and 6.1): the
 * server prices the chosen count again from the payment row through the
 * options pipeline and refuses anything the buyer was not shown. Worked
 * numbers are plan 4.4: T = 1,000.00, r1 = 3 %, r3 = 8 %, r6 = 13 %,
 * k = 1/6.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const SNAPSHOT = {
  id: "snap-1",
  fetchedAt: new Date(NOW - 60_000),
  singleRatePct: D("3"),
  maxInstallmentNonBusiness: 6,
  rates: { world: { "3": "8", "6": "13" } },
};

const CREDIT_WORLD = {
  ok: true as const,
  outcome: "success" as const,
  bank: "Test Bank",
  cardType: "credit",
  brand: "world",
  cardFamily: "world" as const,
  businessCard: false,
};

function buyer(tier: MembershipTierType | null, isTestAccount = false) {
  return {
    businessStatus: null as BusinessStatus | null,
    companyName: null,
    taxId: null,
    isTestAccount,
    membership: tier
      ? {
          status: SubscriptionStatus.active,
          currentPeriodEnd: new Date(NOW + 10 * DAY),
          tier: { type: tier, isActive: true },
        }
      : null,
  };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    isTest: false,
    origin: OrderOrigin.direct_sale,
    totalAmount: D("1000.00"),
    commissionAmount: D("100.00"),
    withholdingTaxAmount: D("0"),
    buyerServiceTaxAmount: D("0"),
    sellerServiceTaxAmount: D("0"),
    buyerShippingAmount: D("0"),
    sellerShippingAmount: D("0"),
    shippingCost: D("0"),
    platformFundedDiscount: D("0"),
    buyerId: "buyer-1",
    shippingAddress: {},
    buyer: buyer(MembershipTierType.free),
    ...overrides,
  };
}

function orderPayment(
  overrides: Record<string, unknown> = {},
  orderOverrides: Record<string, unknown> = {},
) {
  return {
    id: "pay-1",
    amount: D("1000.00"),
    isTest: false,
    paytrMerchant: PaytrMerchant.marketplace,
    tradeCashPaymentId: null,
    orderId: "order-1",
    checkoutGroupId: null,
    tradeCashPayment: null,
    order: order(orderOverrides),
    checkoutGroup: null,
    ...overrides,
  };
}

function setup(
  opts: {
    enabled?: boolean;
    payment?: unknown;
    user?: unknown;
    savedCard?: unknown;
    bin?: unknown;
    snapshot?: unknown;
    rules?: InstallmentRuleCandidate[];
  } = {},
) {
  const prisma = {
    payment: {
      findUnique: jest.fn(async () =>
        opts.payment === undefined ? orderPayment() : opts.payment,
      ),
    },
    user: { findUnique: jest.fn(async () => opts.user ?? null) },
    savedCard: { findFirst: jest.fn(async () => opts.savedCard ?? null) },
  };
  const cache = {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    checkRateLimit: jest.fn(),
  };
  const provider = {
    lookupBin: jest.fn(async () => opts.bin ?? CREDIT_WORLD),
  };
  const options = new InstallmentOptionsService(
    prisma as never,
    cache as never,
    { resolve: jest.fn(() => provider) } as never,
    {
      read: jest.fn(async () => ({
        enabled: opts.enabled ?? true,
        minAmount: D("500"),
      })),
    } as never,
    {
      freshSnapshot: jest.fn(async () =>
        opts.snapshot === undefined ? SNAPSHOT : opts.snapshot,
      ),
    } as never,
    { liveRules: jest.fn(async () => opts.rules ?? []) } as never,
  );
  const service = new InstallmentChargeService(options);
  return { service, prisma, provider };
}

function input(
  selection?: DirectFormInstallmentSelection,
  overrides: Partial<ChargeQuoteInput> = {},
): ChargeQuoteInput {
  return {
    paymentId: "pay-1",
    targetTotal: D("1000.00"),
    paytrMerchant: PaytrMerchant.marketplace,
    selection,
    userId: "buyer-1",
    ...overrides,
  };
}

const THREE = { count: 3, bin: "45467112", expectedTotal: 1066.38 };

describe("InstallmentChargeService.quoteCharge", () => {
  let errorLog: jest.SpyInstance;
  beforeEach(() => {
    errorLog = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe("single payment", () => {
    it("quotes T with the buyer's segment when no installment is chosen (old client)", async () => {
      const { service, provider } = setup({
        payment: orderPayment({}, { buyer: buyer(MembershipTierType.premium) }),
      });
      const quote = await service.quoteCharge(input());
      expect(quote).toMatchObject({
        installmentCount: 1,
        segment: "premium",
        ruleId: null,
        rateSnapshotId: null,
        bin6: null,
      });
      expect(quote.chargedAmount.toFixed(2)).toBe("1000.00");
      expect(quote.feeAmount.toFixed(2)).toBe("0.00");
      expect(quote.platformCostAmount.toFixed(2)).toBe("0.00");
      expect(quote.feeVatRatePct.toFixed(2)).toBe("20.00");
      // A single payment never asks PayTR about the card.
      expect(provider.lookupBin).not.toHaveBeenCalled();
    });

    it("quotes count 1 at T and keeps the saved card used", async () => {
      const { service } = setup();
      const quote = await service.quoteCharge(
        input({ count: 1, expectedTotal: 1000 }, { savedCardId: "card-1" }),
      );
      expect(quote.installmentCount).toBe(1);
      expect(quote.savedCardId).toBe("card-1");
      expect(quote.chargedAmount.toFixed(2)).toBe("1000.00");
    });

    it("refuses count 1 when the shown total is not T (409)", async () => {
      const { service } = setup();
      await expect(
        service.quoteCharge(input({ count: 1, expectedTotal: 999.99 })),
      ).rejects.toMatchObject({
        status: 409,
        response: { i18nKey: "server.payment.installmentPricingChanged" },
      });
    });

    it("resolves a guest purchase to the guest segment, never the system account's tier", async () => {
      const { service } = setup({
        payment: orderPayment(
          {},
          {
            shippingAddress: { isGuestOrder: true },
            buyer: buyer(MembershipTierType.premium),
          },
        ),
      });
      const quote = await service.quoteCharge(
        input(undefined, { userId: null }),
      );
      expect(quote.segment).toBe("guest");
    });
  });

  it("refuses to sign when the payment amount differs from its target total (409, logged)", async () => {
    const { service } = setup();
    await expect(
      service.quoteCharge(input(undefined, { targetTotal: D("999.00") })),
    ).rejects.toMatchObject({
      status: 409,
      response: { i18nKey: "server.payment.paymentAmountOutOfDate" },
    });
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("DIRECT_FORM_AMOUNT_DRIFT payment=pay-1"),
    );
  });

  it("404s an unknown payment", async () => {
    const { service } = setup({ payment: null });
    await expect(service.quoteCharge(input())).rejects.toMatchObject({
      status: 404,
    });
  });

  describe("installments", () => {
    it("signs the server's C for the default rule and snapshots everything (plan 4.4, 3 x)", async () => {
      const { service, provider } = setup();
      const quote = await service.quoteCharge(input(THREE));
      expect(quote.installmentCount).toBe(3);
      expect(quote.baseAmount.toFixed(2)).toBe("1000.00");
      expect(quote.chargedAmount.toFixed(2)).toBe("1066.38");
      expect(quote.feeAmount.toFixed(2)).toBe("66.38");
      expect(quote.platformCostAmount.toFixed(2)).toBe("0.00");
      expect(quote.singleRatePct?.toFixed(3)).toBe("3.000");
      expect(quote.installmentRatePct?.toFixed(3)).toBe("8.000");
      expect(quote.platformSharePct.toFixed(2)).toBe("0.00");
      expect(quote).toMatchObject({
        segment: "free",
        ruleId: null,
        rateSnapshotId: "snap-1",
        bin6: "454671",
        savedCardId: null,
        card: {
          family: "world",
          bank: "Test Bank",
          type: "credit",
          businessCard: false,
        },
      });
      // The 8-digit BIN goes to PayTR; only 6 are kept.
      expect(provider.lookupBin).toHaveBeenCalledWith(
        "45467112",
        expect.anything(),
      );
    });

    it("signs a premium 100% share rule at T with its version and P = T*(rn - r1)", async () => {
      const rule: InstallmentRuleCandidate = {
        id: "rule-premium-v2",
        segment: "premium",
        minCount: 2,
        maxCount: 3,
        allowed: true,
        platformSharePct: D(100),
        priority: 0,
        validFrom: new Date(NOW - DAY),
        validUntil: null,
        archivedAt: null,
        createdAt: new Date(NOW - DAY),
      };
      const { service } = setup({
        payment: orderPayment({}, { buyer: buyer(MembershipTierType.premium) }),
        rules: [rule],
      });
      const quote = await service.quoteCharge(
        input({ ...THREE, expectedTotal: 1000 }),
      );
      expect(quote.chargedAmount.toFixed(2)).toBe("1000.00");
      expect(quote.feeAmount.toFixed(2)).toBe("0.00");
      expect(quote.platformCostAmount.toFixed(2)).toBe("50.00");
      expect(quote.platformSharePct.toFixed(2)).toBe("100.00");
      expect(quote.ruleId).toBe("rule-premium-v2");
      expect(quote.segment).toBe("premium");
    });

    it("refuses a total the buyer was not shown (409 pricing changed)", async () => {
      const { service } = setup();
      await expect(
        service.quoteCharge(input({ ...THREE, expectedTotal: 1060 })),
      ).rejects.toMatchObject({
        status: 409,
        response: { i18nKey: "server.payment.installmentPricingChanged" },
      });
    });

    it("refuses a rule that started after the options call (409, the total moved)", async () => {
      // The buyer saw the default 1,066.38; a 50 % rule for `free` now applies.
      const rule: InstallmentRuleCandidate = {
        id: "rule-free-v1",
        segment: "free",
        minCount: 2,
        maxCount: 6,
        allowed: true,
        platformSharePct: D(50),
        priority: 0,
        validFrom: new Date(NOW - 1000),
        validUntil: null,
        archivedAt: null,
        createdAt: new Date(NOW - 1000),
      };
      const { service } = setup({ rules: [rule] });
      await expect(service.quoteCharge(input(THREE))).rejects.toMatchObject({
        status: 409,
        response: { i18nKey: "server.payment.installmentPricingChanged" },
      });
    });

    const notOffered = {
      status: 400,
      response: { i18nKey: "server.payment.installmentNotOffered" },
    };

    it("refuses any count above 1 while the kill switch is off", async () => {
      const { service, provider } = setup({ enabled: false });
      await expect(service.quoteCharge(input(THREE))).rejects.toMatchObject(
        notOffered,
      );
      expect(provider.lookupBin).not.toHaveBeenCalled();
    });

    it("refuses a count PayTR does not offer for the family", async () => {
      const { service } = setup();
      await expect(
        service.quoteCharge(input({ ...THREE, count: 4 })),
      ).rejects.toMatchObject(notOffered);
    });

    it("refuses a count above 1 without a card", async () => {
      const { service } = setup();
      await expect(
        service.quoteCharge(input({ count: 3, expectedTotal: 1066.38 })),
      ).rejects.toMatchObject(notOffered);
    });

    it("refuses a BIN next to a saved card (it would price another card)", async () => {
      const { service } = setup();
      await expect(
        service.quoteCharge(input(THREE, { savedCardId: "card-1" })),
      ).rejects.toMatchObject(notOffered);
    });

    it("refuses an installment on another PayTR store (membership)", async () => {
      const { service } = setup();
      await expect(
        service.quoteCharge(
          input(THREE, { paytrMerchant: PaytrMerchant.membership }),
        ),
      ).rejects.toMatchObject(notOffered);
    });

    it("answers 409 unavailable when the BIN service fails, and when the rates are stale", async () => {
      const bin = setup({ bin: { ok: false, outcome: "error" } });
      await expect(bin.service.quoteCharge(input(THREE))).rejects.toMatchObject(
        {
          status: 409,
          response: { i18nKey: "server.payment.installmentUnavailable" },
        },
      );
      const rates = setup({ snapshot: null });
      await expect(
        rates.service.quoteCharge(input(THREE)),
      ).rejects.toMatchObject({
        status: 409,
        response: { i18nKey: "server.payment.installmentUnavailable" },
      });
    });

    it.each`
      card                 | bin
      ${"a business card"} | ${{ ...CREDIT_WORLD, businessCard: true }}
      ${"a debit card"}    | ${{ ...CREDIT_WORLD, cardType: "debit" }}
      ${"brand none"}      | ${{ ...CREDIT_WORLD, brand: "none", cardFamily: undefined }}
      ${"a foreign card"}  | ${{ ok: false, outcome: "failed" }}
    `("refuses $card (D5)", async ({ bin }) => {
      const { service } = setup({ bin });
      await expect(service.quoteCharge(input(THREE))).rejects.toMatchObject(
        notOffered,
      );
    });

    it.each`
      kind                      | payment
      ${"a trade cash payment"} | ${orderPayment({ orderId: null, order: null, tradeCashPaymentId: "tcp-1", tradeCashPayment: { payerId: "buyer-1" } })}
      ${"a membership order"}   | ${orderPayment({ paytrMerchant: PaytrMerchant.membership }, { origin: OrderOrigin.platform_service })}
      ${"a boost order"}        | ${orderPayment({}, { origin: OrderOrigin.platform_service })}
    `("refuses $kind (D6)", async ({ payment }) => {
      const { service, provider } = setup({
        payment,
        user: buyer(MembershipTierType.free),
      });
      await expect(service.quoteCharge(input(THREE))).rejects.toMatchObject(
        notOffered,
      );
      expect(provider.lookupBin).not.toHaveBeenCalled();
    });

    it("refuses a payment whose test-lane stamp differs from its order (plan 5.2)", async () => {
      const { service, provider } = setup({
        payment: orderPayment({ isTest: true }, { isTest: false }),
      });
      await expect(service.quoteCharge(input(THREE))).rejects.toMatchObject(
        notOffered,
      );
      expect(provider.lookupBin).not.toHaveBeenCalled();
    });

    it("refuses a live payment of a buyer moved to the test lane", async () => {
      const { service } = setup({
        payment: orderPayment(
          {},
          { buyer: buyer(MembershipTierType.free, true) },
        ),
      });
      await expect(service.quoteCharge(input(THREE))).rejects.toMatchObject(
        notOffered,
      );
    });

    it("prices a test-lane payment of a test account like any other", async () => {
      const { service } = setup({
        payment: orderPayment(
          { isTest: true },
          { isTest: true, buyer: buyer(MembershipTierType.free, true) },
        ),
      });
      const quote = await service.quoteCharge(input(THREE));
      expect(quote.chargedAmount.toFixed(2)).toBe("1066.38");
    });

    it("refuses a count the keep guard refuses and logs it (AS-P5)", async () => {
      // Seller net 990 of a 1,000 order: a 10 TL margin cannot cover 8 % of C.
      const { service } = setup({
        payment: orderPayment({}, { commissionAmount: D("10.00") }),
      });
      await expect(service.quoteCharge(input(THREE))).rejects.toMatchObject(
        notOffered,
      );
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining(
          "INSTALLMENT_KEEP_GUARD_REFUSED payment=pay-1 count=3",
        ),
      );
    });

    it("prices a saved card from its stored family, never a BIN", async () => {
      const { service, provider, prisma } = setup({
        savedCard: {
          brand: "World",
          bank: "Saved Bank",
          cardType: "Credit",
          businessCard: false,
        },
      });
      const quote = await service.quoteCharge(
        input({ count: 3, expectedTotal: 1066.38 }, { savedCardId: "card-1" }),
      );
      expect(quote).toMatchObject({
        savedCardId: "card-1",
        bin6: null,
        card: { family: "world", bank: "Saved Bank", type: "credit" },
      });
      expect(provider.lookupBin).not.toHaveBeenCalled();
      expect(prisma.savedCard.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "card-1",
            userId: "buyer-1",
            paytrMerchant: PaytrMerchant.marketplace,
          }),
        }),
      );
    });

    it("prices a cart of two sellers with the keep guard over both orders", async () => {
      const group = {
        ...orderPayment({
          orderId: null,
          order: null,
          checkoutGroupId: "grp-1",
        }),
        checkoutGroup: {
          buyerId: "buyer-1",
          isGuest: false,
          buyer: buyer(MembershipTierType.free),
          orders: [
            order({
              id: "o-a",
              totalAmount: D("600.00"),
              commissionAmount: D("60.00"),
            }),
            order({
              id: "o-b",
              totalAmount: D("400.00"),
              commissionAmount: D("40.00"),
            }),
          ],
        },
      };
      const { service } = setup({ payment: group });
      const quote = await service.quoteCharge(input(THREE));
      expect(quote.chargedAmount.toFixed(2)).toBe("1066.38");
    });
  });
});

describe("chargeAttemptCreateData", () => {
  it("writes the whole pricing snapshot of the signed form", () => {
    const data = chargeAttemptCreateData(
      {
        installmentCount: 3,
        baseAmount: D("1000.00"),
        feeAmount: D("66.38"),
        chargedAmount: D("1066.38"),
        platformCostAmount: D("0"),
        singleRatePct: D("3"),
        installmentRatePct: D("8"),
        feeVatRatePct: D("20"),
        segment: "free",
        ruleId: null,
        platformSharePct: D("0"),
        card: {
          family: "world",
          bank: "Test Bank",
          type: "credit",
          businessCard: false,
        },
        bin6: "454671",
        savedCardId: null,
        rateSnapshotId: "snap-1",
      },
      {
        paymentId: "pay-1",
        merchantOid: "ORD123ABC",
        paytrMerchant: PaytrMerchant.marketplace,
      },
    );
    expect(data).toEqual({
      paymentId: "pay-1",
      merchantOid: "ORD123ABC",
      paytrMerchant: PaytrMerchant.marketplace,
      installmentCount: 3,
      baseAmount: D("1000.00"),
      installmentFeeAmount: D("66.38"),
      chargedAmount: D("1066.38"),
      platformCostAmount: D("0"),
      singleRatePct: D("3"),
      installmentRatePct: D("8"),
      feeVatRatePct: D("20"),
      buyerSegment: "free",
      installmentRuleId: null,
      platformSharePct: D("0"),
      cardFamily: "world",
      cardBank: "Test Bank",
      cardType: "credit",
      businessCard: false,
      bin6: "454671",
      savedCardId: null,
      rateSnapshotId: "snap-1",
    });
  });
});
