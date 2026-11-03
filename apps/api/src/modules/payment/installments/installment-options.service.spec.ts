import { Logger } from "@nestjs/common";
import {
  BusinessStatus,
  MembershipTierType,
  OrderOrigin,
  PaytrMerchant,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";
import {
  InstallmentOptionsService,
  normalizedBin,
} from "./installment-options.service";
import type { InstallmentRuleCandidate } from "./installment-rules";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

const SNAPSHOT = {
  id: "snap-1",
  fetchedAt: new Date(NOW - 60_000),
  singleRatePct: D("3"),
  maxInstallmentNonBusiness: 6,
  rates: { world: { "3": "8", "6": "13" }, bonus: { "2": "5" } },
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

function membership(
  tier: MembershipTierType,
  periodEnd = new Date(NOW + 10 * DAY),
) {
  return {
    status: SubscriptionStatus.active,
    currentPeriodEnd: periodEnd,
    tier: { type: tier, isActive: true },
  };
}

function buyer(tier: MembershipTierType | null, periodEnd?: Date) {
  return {
    businessStatus: null as BusinessStatus | null,
    companyName: null,
    taxId: null,
    membership: tier ? membership(tier, periodEnd) : null,
  };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
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
  orderOverrides = {},
) {
  return {
    id: "pay-1",
    amount: D("1000.00"),
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
    minAmount?: string;
    payment?: unknown;
    user?: unknown;
    savedCard?: unknown;
    cached?: unknown;
    bin?: unknown;
    snapshot?: unknown;
    rules?: InstallmentRuleCandidate[];
    rateLimitAllowed?: boolean;
  } = {},
) {
  const prisma = {
    payment: { findUnique: jest.fn(async () => opts.payment ?? null) },
    user: { findUnique: jest.fn(async () => opts.user ?? null) },
    savedCard: { findFirst: jest.fn(async () => opts.savedCard ?? null) },
  };
  const cache = {
    get: jest.fn(async () => opts.cached ?? null),
    set: jest.fn(async () => undefined),
    checkRateLimit: jest.fn(async () => ({
      allowed: opts.rateLimitAllowed ?? true,
      remaining: 1,
      resetAt: new Date(),
    })),
  };
  const provider = {
    lookupBin: jest.fn(async () => opts.bin ?? CREDIT_WORLD),
  };
  const providers = { resolve: jest.fn(() => provider) };
  const settings = {
    read: jest.fn(async () => ({
      enabled: opts.enabled ?? true,
      minAmount: D(opts.minAmount ?? "500"),
    })),
  };
  const rates = {
    freshSnapshot: jest.fn(async () =>
      opts.snapshot === undefined ? SNAPSHOT : opts.snapshot,
    ),
  };
  const rules = { liveRules: jest.fn(async () => opts.rules ?? []) };
  const service = new InstallmentOptionsService(
    prisma as never,
    cache as never,
    providers as never,
    settings as never,
    rates as never,
    rules as never,
  );
  return { service, prisma, cache, provider, rates, rules };
}

const member = { userId: "buyer-1", capabilityAuthorized: false };
const guestCaller = { userId: null, capabilityAuthorized: true };
const anonymous = { userId: null, capabilityAuthorized: false };

function premiumFreeRule(
  overrides: Partial<InstallmentRuleCandidate> = {},
): InstallmentRuleCandidate {
  return {
    id: "rule-premium-v1",
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
    ...overrides,
  };
}

describe("InstallmentOptionsService.getOptions", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe("request shape", () => {
    it.each`
      case                         | query
      ${"no card"}                 | ${{ paymentId: "pay-1" }}
      ${"both bin and saved card"} | ${{ bin: "45467112", savedCardId: "card-1", amount: 1000 }}
      ${"no target"}               | ${{ bin: "45467112" }}
      ${"both payment and amount"} | ${{ bin: "45467112", paymentId: "pay-1", amount: 1000 }}
    `("refuses $case with 400", async ({ query }) => {
      const { service } = setup();
      await expect(service.getOptions(query, member)).rejects.toMatchObject({
        status: 400,
        response: {
          i18nKey: "server.payment.installmentOptionsInvalidRequest",
        },
      });
    });

    it("refuses a saved card without a signed-in buyer", async () => {
      const { service } = setup();
      await expect(
        service.getOptions({ savedCardId: "card-1", amount: 1000 }, anonymous),
      ).rejects.toMatchObject({
        status: 403,
        response: { i18nKey: "server.payment.loginRequiredForSavedCard" },
      });
    });
  });

  describe("access to a payment (direct-form rule)", () => {
    it("lets the buyer in", async () => {
      const { service } = setup({ payment: orderPayment() });
      await expect(
        service.getOptions({ bin: "45467112", paymentId: "pay-1" }, member),
      ).resolves.toMatchObject({ enabled: true });
    });

    it("lets a guest in with the payment capability", async () => {
      const { service } = setup({
        payment: orderPayment({}, { shippingAddress: { isGuestOrder: true } }),
      });
      await expect(
        service.getOptions(
          { bin: "45467112", paymentId: "pay-1" },
          guestCaller,
        ),
      ).resolves.toMatchObject({ enabled: true });
    });

    it.each`
      case                              | caller
      ${"another signed-in user"}       | ${{ userId: "someone-else", capabilityAuthorized: false }}
      ${"nobody, without a capability"} | ${anonymous}
    `("refuses $case with 403 before pricing", async ({ caller }) => {
      const { service, provider } = setup({ payment: orderPayment() });
      await expect(
        service.getOptions({ bin: "45467112", paymentId: "pay-1" }, caller),
      ).rejects.toMatchObject({
        status: 403,
        response: { i18nKey: "server.payment.viewPaymentForbidden" },
      });
      expect(provider.lookupBin).not.toHaveBeenCalled();
    });

    it("answers 404 for an unknown payment", async () => {
      const { service } = setup({ payment: null });
      await expect(
        service.getOptions({ bin: "45467112", paymentId: "pay-x" }, member),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("limits a payment to 20 calls a minute (429)", async () => {
      const { service, cache } = setup({
        payment: orderPayment(),
        rateLimitAllowed: false,
      });
      await expect(
        service.getOptions({ bin: "45467112", paymentId: "pay-1" }, member),
      ).rejects.toMatchObject({
        status: 429,
        response: {
          i18nKey: "server.payment.installmentOptionsTooManyRequests",
        },
      });
      expect(cache.checkRateLimit).toHaveBeenCalledWith(
        "installments:options:payment:pay-1",
        20,
        60,
      );
    });

    it("keeps answering when the per-payment counter is down (the IP throttle still applies)", async () => {
      const { service, cache } = setup({ payment: orderPayment() });
      cache.checkRateLimit.mockRejectedValueOnce(new Error("redis down"));
      await expect(
        service.getOptions({ bin: "45467112", paymentId: "pay-1" }, member),
      ).resolves.toMatchObject({ enabled: true });
    });
  });

  describe("the default rule (plan 6.1)", () => {
    it("lists single first, then every count PayTR offers for the family, priced with s_n = 0", async () => {
      const { service } = setup({ payment: orderPayment() });
      expect(
        await service.getOptions(
          { bin: "45467112", paymentId: "pay-1" },
          member,
        ),
      ).toEqual({
        enabled: true,
        card: { bank: "Test Bank", family: "world", type: "credit" },
        baseAmount: 1000,
        options: [
          { count: 1, totalAmount: 1000, feeAmount: 0, monthlyAmount: 1000 },
          {
            count: 3,
            totalAmount: 1066.38,
            feeAmount: 66.38,
            monthlyAmount: 355.46,
          },
          {
            count: 6,
            totalAmount: 1142.22,
            feeAmount: 142.22,
            monthlyAmount: 190.37,
          },
        ],
      });
    });

    it("prices a displayed amount the same way (web checkout, before the order exists)", async () => {
      const { service, prisma } = setup({
        user: buyer(MembershipTierType.free),
      });
      const answer = await service.getOptions(
        { bin: "45467112", amount: 1000 },
        member,
      );
      expect(answer.options.map((o) => o.totalAmount)).toEqual([
        1000, 1066.38, 1142.22,
      ]);
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it("never exposes the segment, the rule or the platform share", async () => {
      const { service } = setup({
        payment: orderPayment({}, { buyer: buyer(MembershipTierType.premium) }),
        rules: [premiumFreeRule()],
      });
      const answer = await service.getOptions(
        { bin: "45467112", paymentId: "pay-1" },
        member,
      );
      const text = JSON.stringify(answer);
      expect(text).not.toMatch(/premium|segment|rule|share|platformCost/i);
    });
  });

  describe("single payment only, with the reason", () => {
    it("is disabled while the kill switch is off, before any PayTR call", async () => {
      const { service, provider, rates } = setup({
        enabled: false,
        payment: orderPayment(),
      });
      expect(
        await service.getOptions(
          { bin: "45467112", paymentId: "pay-1" },
          member,
        ),
      ).toEqual({
        enabled: false,
        reason: "disabled",
        baseAmount: 1000,
        options: [
          { count: 1, totalAmount: 1000, feeAmount: 0, monthlyAmount: 1000 },
        ],
      });
      expect(provider.lookupBin).not.toHaveBeenCalled();
      expect(rates.freshSnapshot).not.toHaveBeenCalled();
    });

    it.each`
      case                                | payment
      ${"membership (membership store)"}  | ${orderPayment({ paytrMerchant: PaytrMerchant.membership }, { origin: OrderOrigin.platform_service })}
      ${"boost (platform service order)"} | ${orderPayment({}, { origin: OrderOrigin.platform_service })}
      ${"trade cash payment"}             | ${orderPayment({ orderId: null, order: null, tradeCashPaymentId: "tcp-1", tradeCashPayment: { payerId: "buyer-1" } })}
    `("refuses a $case (D6) without a BIN lookup", async ({ payment }) => {
      const { service, provider } = setup({ payment });
      expect(
        await service.getOptions(
          { bin: "45467112", paymentId: "pay-1" },
          member,
        ),
      ).toMatchObject({ enabled: false, reason: "not_offered_for_payment" });
      expect(provider.lookupBin).not.toHaveBeenCalled();
    });

    it("offers an offer order (D6)", async () => {
      const { service } = setup({
        payment: orderPayment({}, { origin: OrderOrigin.offer }),
      });
      expect(
        await service.getOptions(
          { bin: "45467112", paymentId: "pay-1" },
          member,
        ),
      ).toMatchObject({ enabled: true });
    });

    it("answers below_minimum with the minimum when T < installment_min_amount", async () => {
      const { service, provider } = setup({
        minAmount: "1000.01",
        payment: orderPayment(),
      });
      expect(
        await service.getOptions(
          { bin: "45467112", paymentId: "pay-1" },
          member,
        ),
      ).toMatchObject({
        enabled: false,
        reason: "below_minimum",
        minAmount: 1000.01,
      });
      expect(provider.lookupBin).not.toHaveBeenCalled();
    });

    it("offers at exactly the minimum", async () => {
      const { service } = setup({ minAmount: "1000", payment: orderPayment() });
      expect(
        await service.getOptions(
          { bin: "45467112", paymentId: "pay-1" },
          member,
        ),
      ).toMatchObject({ enabled: true });
    });

    it.each`
      case                              | bin
      ${"a debit card"}                 | ${{ ...CREDIT_WORLD, cardType: "debit" }}
      ${"a business card"}              | ${{ ...CREDIT_WORLD, businessCard: true }}
      ${"brand none"}                   | ${{ ...CREDIT_WORLD, brand: "none", cardFamily: undefined }}
      ${"a foreign card"}               | ${{ ok: false, outcome: "failed", errMsg: "BIN not defined" }}
      ${"a family PayTR does not list"} | ${{ ...CREDIT_WORLD, brand: "axess", cardFamily: "axess" }}
    `("answers card_not_eligible for $case (D5)", async ({ bin }) => {
      const { service } = setup({ payment: orderPayment(), bin });
      expect(
        await service.getOptions(
          { bin: "45467112", paymentId: "pay-1" },
          member,
        ),
      ).toMatchObject({ enabled: false, reason: "card_not_eligible" });
    });

    it("answers unavailable when the BIN lookup errors or times out", async () => {
      const { service } = setup({
        payment: orderPayment(),
        bin: {
          ok: false,
          outcome: "error",
          errMsg: "The operation was aborted due to timeout",
        },
      });
      expect(
        await service.getOptions(
          { bin: "45467112", paymentId: "pay-1" },
          member,
        ),
      ).toMatchObject({ enabled: false, reason: "unavailable" });
    });

    it("answers unavailable without a fresh rate snapshot", async () => {
      const { service } = setup({ payment: orderPayment(), snapshot: null });
      expect(
        await service.getOptions(
          { bin: "45467112", paymentId: "pay-1" },
          member,
        ),
      ).toMatchObject({
        enabled: false,
        reason: "unavailable",
        card: { family: "world", type: "credit", bank: "Test Bank" },
      });
    });

    it("answers not_offered_for_payment when rules remove every count", async () => {
      const { service } = setup({
        payment: orderPayment({}, { shippingAddress: { isGuestOrder: true } }),
        rules: [
          premiumFreeRule({
            id: "rule-guest",
            segment: "guest",
            minCount: 2,
            maxCount: 12,
            allowed: false,
            platformSharePct: D(0),
          }),
        ],
      });
      expect(
        await service.getOptions(
          { bin: "45467112", paymentId: "pay-1" },
          guestCaller,
        ),
      ).toMatchObject({ enabled: false, reason: "not_offered_for_payment" });
    });

    it("drops the counts the keep guard refuses (payment mode only)", async () => {
      // Seller amount 950.00 leaves 50.00: a 100% share at 3 (deduction 80.00) fails,
      // the default 6 (C 1,142.22, deduction 148.49, margin 192.22) holds.
      const payment = orderPayment(
        {},
        {
          buyer: buyer(MembershipTierType.premium),
          commissionAmount: D("50.00"),
        },
      );
      const { service } = setup({ payment, rules: [premiumFreeRule()] });
      const answer = await service.getOptions(
        { bin: "45467112", paymentId: "pay-1" },
        member,
      );
      expect(answer.options.map((o) => o.count)).toEqual([1, 6]);

      const amountMode = setup({
        user: buyer(MembershipTierType.premium),
        rules: [premiumFreeRule()],
      });
      const display = await amountMode.service.getOptions(
        { bin: "45467112", amount: 1000 },
        member,
      );
      expect(display.options.map((o) => o.count)).toEqual([1, 3, 6]);
    });
  });

  describe("segments (plan 4.6.1)", () => {
    it("gives a premium buyer the premium rule ('vade farksız' at 3)", async () => {
      const { service, rules } = setup({
        payment: orderPayment({}, { buyer: buyer(MembershipTierType.premium) }),
        rules: [premiumFreeRule()],
      });
      const answer = await service.getOptions(
        { bin: "45467112", paymentId: "pay-1" },
        member,
      );
      expect(rules.liveRules).toHaveBeenCalledWith("premium", expect.any(Date));
      expect(answer.options[1]).toEqual({
        count: 3,
        totalAmount: 1000,
        feeAmount: 0,
        monthlyAmount: 333.33,
      });
    });

    it("drops a premium buyer whose period ended back to the default (free)", async () => {
      const { service, rules } = setup({
        payment: orderPayment(
          {},
          { buyer: buyer(MembershipTierType.premium, new Date(NOW - DAY)) },
        ),
        rules: [premiumFreeRule()],
      });
      await service.getOptions({ bin: "45467112", paymentId: "pay-1" }, member);
      expect(rules.liveRules).toHaveBeenCalledWith("free", expect.any(Date));
    });

    it("never gives a guest order the shared system account's tier", async () => {
      const { service, rules } = setup({
        payment: orderPayment(
          {},
          {
            shippingAddress: { isGuestOrder: true },
            buyer: buyer(MembershipTierType.business),
          },
        ),
      });
      await service.getOptions(
        { bin: "45467112", paymentId: "pay-1" },
        guestCaller,
      );
      expect(rules.liveRules).toHaveBeenCalledWith("guest", expect.any(Date));
    });

    it("reads a guest cart from the checkout group and prices it by its orders", async () => {
      const payment = orderPayment({
        orderId: null,
        order: null,
        checkoutGroupId: "group-1",
        checkoutGroup: {
          buyerId: "system-guest",
          isGuest: true,
          buyer: buyer(MembershipTierType.premium),
          orders: [
            order({ totalAmount: D("600.00") }),
            order({ totalAmount: D("400.00") }),
          ],
        },
      });
      const { service, rules } = setup({ payment });
      const answer = await service.getOptions(
        { bin: "45467112", paymentId: "pay-1" },
        guestCaller,
      );
      expect(rules.liveRules).toHaveBeenCalledWith("guest", expect.any(Date));
      expect(answer.enabled).toBe(true);
    });

    it("uses the JWT user's tier in amount mode and guest without a user", async () => {
      const signedIn = setup({ user: buyer(MembershipTierType.basic) });
      await signedIn.service.getOptions(
        { bin: "45467112", amount: 1000 },
        member,
      );
      expect(signedIn.rules.liveRules).toHaveBeenCalledWith(
        "basic",
        expect.any(Date),
      );

      const nobody = setup();
      await nobody.service.getOptions(
        { bin: "45467112", amount: 1000 },
        anonymous,
      );
      expect(nobody.rules.liveRules).toHaveBeenCalledWith(
        "guest",
        expect.any(Date),
      );
      expect(nobody.prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("saved card", () => {
    it("takes the family from SavedCard.brand of the buyer's active marketplace card", async () => {
      const { service, prisma, provider } = setup({
        user: buyer(MembershipTierType.free),
        savedCard: {
          brand: "World",
          bank: "Test Bank",
          cardType: "Credit",
          businessCard: false,
        },
      });
      const answer = await service.getOptions(
        { savedCardId: "card-1", amount: 1000 },
        member,
      );
      expect(answer).toMatchObject({
        enabled: true,
        card: { family: "world", type: "credit" },
      });
      expect(prisma.savedCard.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "card-1",
            userId: "buyer-1",
            paytrMerchant: "marketplace",
            status: "active",
          },
        }),
      );
      expect(provider.lookupBin).not.toHaveBeenCalled();
    });

    it("answers 404 for a card that is not the buyer's", async () => {
      const { service } = setup({ user: buyer(null), savedCard: null });
      await expect(
        service.getOptions({ savedCardId: "card-1", amount: 1000 }, member),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("refuses a saved card whose business flag is unknown (fail closed)", async () => {
      const { service } = setup({
        user: buyer(null),
        savedCard: {
          brand: "world",
          bank: null,
          cardType: "credit",
          businessCard: null,
        },
      });
      expect(
        await service.getOptions(
          { savedCardId: "card-1", amount: 1000 },
          member,
        ),
      ).toMatchObject({ reason: "card_not_eligible" });
    });
  });
});

describe("InstallmentOptionsService.lookupCard (BIN cache)", () => {
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;
  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    log = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("answers from the cache without calling PayTR", async () => {
    const cached = {
      outcome: "success",
      cardType: "credit",
      family: "bonus",
      businessCard: false,
    };
    const { service, provider, cache } = setup({ cached });
    expect(await service.lookupCard("45467112")).toEqual(cached);
    expect(cache.get).toHaveBeenCalledWith("paytr:bin:45467112");
    expect(provider.lookupBin).not.toHaveBeenCalled();
  });

  it("caches a success for 7 days, with the 3 s timeout on the miss", async () => {
    const { service, provider, cache } = setup();
    const facts = await service.lookupCard("45467112");
    expect(facts).toEqual({
      outcome: "success",
      bank: "Test Bank",
      cardType: "credit",
      family: "world",
      businessCard: false,
    });
    expect(provider.lookupBin).toHaveBeenCalledWith("45467112", {
      timeoutMs: 3000,
    });
    expect(cache.set).toHaveBeenCalledWith("paytr:bin:45467112", facts, {
      ttl: 7 * 24 * 60 * 60,
    });
  });

  it("caches a failed BIN (not defined) for 1 day", async () => {
    const { service, cache } = setup({
      bin: { ok: false, outcome: "failed", errMsg: "x" },
    });
    expect(await service.lookupCard("454671")).toEqual({ outcome: "failed" });
    expect(cache.set).toHaveBeenCalledWith(
      "paytr:bin:454671",
      { outcome: "failed" },
      {
        ttl: 24 * 60 * 60,
      },
    );
  });

  it("never caches an error or a timeout", async () => {
    const { service, cache } = setup({
      bin: { ok: false, outcome: "error", errMsg: "timeout" },
    });
    expect(await service.lookupCard("45467112")).toEqual({ outcome: "error" });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("ignores a cache entry that is not a known answer", async () => {
    const { service, provider } = setup({ cached: { outcome: "error" } });
    await service.lookupCard("45467112");
    expect(provider.lookupBin).toHaveBeenCalled();
  });

  it("sends and caches 8 digits when it has them, else 6", () => {
    expect(normalizedBin("45467112")).toBe("45467112");
    expect(normalizedBin("4546711")).toBe("454671");
    expect(normalizedBin("454671")).toBe("454671");
  });

  it("never logs the BIN", async () => {
    const { service } = setup({
      bin: { ok: false, outcome: "error", errMsg: "down" },
    });
    await service.lookupCard("45467112");
    const logged = [...warn.mock.calls, ...log.mock.calls]
      .flat()
      .map(String)
      .join("\n");
    expect(logged).not.toContain("454671");
  });
});
