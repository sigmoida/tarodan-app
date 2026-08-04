import {
  BusinessStatus,
  MembershipTierType,
  OrderStatus,
  PaymentStatus,
  SavedCardStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { BadGatewayException, ForbiddenException } from "@nestjs/common";
import { PaymentProvider } from "../payment/dto";
import { MembershipSubscriptionService } from "./membership-subscription.service";

describe("MembershipSubscriptionService", () => {
  const money = (value: number) => ({
    toNumber: () => value,
    valueOf: () => value,
    toString: () => String(value),
  });

  const tier = (
    type: MembershipTierType,
    overrides: Record<string, unknown> = {},
  ) => ({
    id: `${type}-tier`,
    type,
    name: `${type} membership`,
    isActive: true,
    sortOrder:
      type === MembershipTierType.free
        ? 0
        : type === MembershipTierType.basic
          ? 1
          : type === MembershipTierType.premium
            ? 2
            : 3,
    monthlyPrice: money(type === MembershipTierType.free ? 0 : 100),
    yearlyPrice: money(type === MembershipTierType.free ? 0 : 1000),
    ...overrides,
  });

  const membership = (
    memberTier = tier(MembershipTierType.free),
    overrides: Record<string, unknown> = {},
  ) => ({
    id: "membership-1",
    userId: "user-1",
    tierId: memberTier.id,
    tier: memberTier,
    status: SubscriptionStatus.active,
    autoRenew: false,
    currentPeriodStart: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    scheduledTierType: null,
    scheduledBillingPeriod: null,
    user: {
      businessStatus: BusinessStatus.approved,
      companyName: "Acme A.S.",
      taxId: "1234567890",
      savedCards: [],
    },
    ...overrides,
  });

  const makeService = () => {
    const tx = {
      order: { create: jest.fn() },
      membershipPayment: { create: jest.fn() },
    };
    const prisma = {
      // Sipariş numarası çakışma kontrolü (generateUniqueReference).
      order: { count: jest.fn().mockResolvedValue(0) },
      membershipTier: { findUnique: jest.fn() },
      userMembership: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      membershipPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn(), findFirst: jest.fn() },
      category: { findFirst: jest.fn() },
      product: { findUnique: jest.fn(), create: jest.fn() },
      savedCard: { findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const paymentService = {
      initiatePayment: jest.fn().mockResolvedValue({
        paymentId: "payment-1",
        provider: PaymentProvider.paytr,
        expiresIn: 300,
      }),
    };
    const provider = {
      chargeRecurring: jest.fn(),
      queryPaymentStatus: jest.fn(),
      capiDeleteCard: jest.fn(),
    };
    const paymentProviders = { resolve: jest.fn(() => provider) };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const common = {
      getUserMembership: jest.fn().mockResolvedValue({
        id: "membership-1",
        tier: { type: MembershipTierType.free },
      }),
    };
    const providerEvents = { record: jest.fn().mockResolvedValue(undefined) };
    const virtualOrder = {
      completeRecurringMembershipPayment: jest.fn(),
      failRecurringMembershipPayment: jest.fn(),
    };
    const service = new MembershipSubscriptionService(
      prisma as any,
      paymentService as any,
      paymentProviders as any,
      config as any,
      common as any,
      providerEvents as any,
      virtualOrder as any,
    );
    return {
      service,
      prisma,
      tx,
      paymentService,
      provider,
      config,
      common,
      providerEvents,
      virtualOrder,
    };
  };

  it("revokes a saved card only after PayTR confirms deletion", async () => {
    const { service, prisma, provider } = makeService();
    prisma.savedCard.findFirst.mockResolvedValue({
      id: "card-1",
      userId: "user-1",
      utoken: "utoken-1",
      ctoken: "ctoken-1",
      status: SavedCardStatus.active,
    });
    provider.capiDeleteCard.mockResolvedValue({ status: "success" });

    await expect(service.deleteSavedCard("user-1", "card-1")).resolves.toEqual({
      deleted: true,
    });
    expect(provider.capiDeleteCard).toHaveBeenCalledWith(
      "utoken-1",
      "ctoken-1",
    );
    expect(prisma.savedCard.update).toHaveBeenCalledWith({
      where: { id: "card-1" },
      data: { status: SavedCardStatus.revoked, isDefault: false },
    });
  });

  it("keeps a saved card active when PayTR does not confirm deletion", async () => {
    const { service, prisma, provider } = makeService();
    prisma.savedCard.findFirst.mockResolvedValue({
      id: "card-1",
      userId: "user-1",
      utoken: "utoken-1",
      ctoken: "ctoken-1",
      status: SavedCardStatus.active,
    });
    provider.capiDeleteCard.mockResolvedValue({
      status: "error",
      reason: "provider unavailable",
    });

    await expect(
      service.deleteSavedCard("user-1", "card-1"),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.savedCard.update).not.toHaveBeenCalled();
  });

  it("keeps a saved card active when the PayTR deletion call fails", async () => {
    const { service, prisma, provider } = makeService();
    prisma.savedCard.findFirst.mockResolvedValue({
      id: "card-1",
      userId: "user-1",
      utoken: "utoken-1",
      ctoken: "ctoken-1",
      status: SavedCardStatus.active,
    });
    provider.capiDeleteCard.mockRejectedValue(new Error("network failure"));

    await expect(
      service.deleteSavedCard("user-1", "card-1"),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.savedCard.update).not.toHaveBeenCalled();
  });

  it("does not let an unapproved company subscribe to Business", async () => {
    const { service, prisma, paymentService } = makeService();
    prisma.membershipTier.findUnique.mockResolvedValue(
      tier(MembershipTierType.business),
    );
    prisma.user.findUnique.mockResolvedValue({
      businessStatus: BusinessStatus.pending,
      companyName: "Acme A.S.",
      taxId: "1234567890",
    });

    await expect(
      service.subscribe("user-1", {
        tierType: MembershipTierType.business,
        billingPeriod: "monthly",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(paymentService.initiatePayment).not.toHaveBeenCalled();
    expect(prisma.userMembership.update).not.toHaveBeenCalled();
  });

  it("keeps the paid entitlement unchanged while opening an upgrade intent", async () => {
    const { service, prisma, common } = makeService();
    const target = tier(MembershipTierType.premium);
    const current = membership(tier(MembershipTierType.basic));
    prisma.membershipTier.findUnique.mockResolvedValue(target);
    prisma.userMembership.findUnique.mockResolvedValue(current);
    const initiate = jest
      .spyOn(service, "initiateMembershipPayment")
      .mockResolvedValue({
        paymentId: "payment-1",
        membershipPaymentId: "intent-1",
        orderId: "order-1",
        provider: PaymentProvider.paytr,
        expiresIn: 300,
      });

    await service.subscribe("user-1", {
      tierType: MembershipTierType.premium,
      billingPeriod: "monthly",
    });

    expect(prisma.userMembership.update).not.toHaveBeenCalled();
    expect(initiate).toHaveBeenCalledWith(
      "user-1",
      PaymentProvider.paytr,
      undefined,
      { tier: target, billingPeriod: "monthly" },
    );
    expect(common.getUserMembership).toHaveBeenCalledWith("user-1");
  });

  it("reuses a matching pending intent without changing its price snapshot", async () => {
    const { service, prisma, paymentService } = makeService();
    const target = tier(MembershipTierType.premium);
    prisma.userMembership.findUnique.mockResolvedValue(membership());
    prisma.membershipPayment.findFirst.mockResolvedValue({
      id: "intent-1",
      membershipId: "membership-1",
      targetTierId: target.id,
      targetTier: target,
      billingPeriod: "monthly",
      amount: money(100),
      status: PaymentStatus.pending,
      order: {
        id: "order-1",
        productId: `membership-${target.id}`,
        totalAmount: money(100),
        status: OrderStatus.pending_payment,
      },
    });

    const result = await service.initiateMembershipPayment(
      "user-1",
      PaymentProvider.paytr,
      undefined,
      {
        tier: { ...target, monthlyPrice: money(999) } as any,
        billingPeriod: "monthly",
      },
    );

    expect(result.membershipPaymentId).toBe("intent-1");
    expect(paymentService.initiatePayment).toHaveBeenCalledWith(
      "user-1",
      { orderId: "order-1", provider: PaymentProvider.paytr },
      undefined,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a pending intent created for another tier", async () => {
    const { service, prisma, paymentService } = makeService();
    const premium = tier(MembershipTierType.premium);
    const business = tier(MembershipTierType.business);
    prisma.userMembership.findUnique.mockResolvedValue(membership());
    prisma.membershipPayment.findFirst.mockResolvedValue({
      id: "intent-1",
      targetTierId: premium.id,
      targetTier: premium,
      billingPeriod: "monthly",
      amount: money(100),
      order: {
        id: "order-1",
        productId: `membership-${premium.id}`,
        totalAmount: money(100),
      },
    });

    await expect(
      service.initiateMembershipPayment(
        "user-1",
        PaymentProvider.paytr,
        undefined,
        { tier: business as any, billingPeriod: "monthly" },
      ),
    ).rejects.toThrow(
      "Başka bir paket veya dönem için bekleyen üyelik ödemesi bulunuyor",
    );
    expect(paymentService.initiatePayment).not.toHaveBeenCalled();
  });

  it("creates the order and immutable intent in one transaction", async () => {
    const { service, prisma, tx, paymentService } = makeService();
    const target = tier(MembershipTierType.premium);
    const current = membership();
    prisma.userMembership.findUnique.mockResolvedValue(current);
    prisma.user.findFirst.mockResolvedValue({
      id: "platform-1",
      email: "platform@tarodan.com",
      sellerType: "platform",
    });
    prisma.category.findFirst.mockResolvedValue({ id: "category-1" });
    prisma.product.findUnique.mockResolvedValue({
      id: `membership-${target.id}`,
    });
    tx.order.create.mockResolvedValue({
      id: "order-1",
      productId: `membership-${target.id}`,
      totalAmount: money(100),
    });
    tx.membershipPayment.create.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: "intent-1",
        ...data,
        order: {
          id: "order-1",
          productId: `membership-${target.id}`,
          totalAmount: money(100),
        },
        targetTier: target,
      }),
    );

    const result = await service.initiateMembershipPayment(
      "user-1",
      PaymentProvider.paytr,
      undefined,
      { tier: target as any, billingPeriod: "monthly" },
    );

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        buyerId: "user-1",
        sellerId: "platform-1",
        productId: `membership-${target.id}`,
        totalAmount: 100,
        status: OrderStatus.pending_payment,
        shippingAddress: {
          type: "membership",
          targetTierId: target.id,
          billingPeriod: "monthly",
          priceSnapshot: 100,
        },
      }),
    });
    expect(tx.membershipPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        membershipId: "membership-1",
        orderId: "order-1",
        targetTierId: target.id,
        billingPeriod: "monthly",
        amount: 100,
        provider: PaymentProvider.paytr,
        status: PaymentStatus.pending,
        metadata: expect.objectContaining({
          kind: "one_time",
          priceSnapshot: 100,
          createdFrom: "subscribe",
        }),
      }),
      include: { order: true, targetTier: true },
    });
    expect(result).toMatchObject({
      paymentId: "payment-1",
      membershipPaymentId: "intent-1",
      orderId: "order-1",
    });
    expect(paymentService.initiatePayment).toHaveBeenCalledTimes(1);
  });

  it("cancels renewal but preserves the paid tier until period end", async () => {
    const { service, prisma } = makeService();
    const current = membership(tier(MembershipTierType.premium));
    prisma.userMembership.findUnique.mockResolvedValue(current);

    await service.cancelSubscription("user-1");

    expect(prisma.userMembership.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: {
        status: SubscriptionStatus.cancelled,
        cancelledAt: expect.any(Date),
        autoRenew: false,
        scheduledTierType: null,
        scheduledBillingPeriod: null,
      },
    });
  });

  it("does not enable auto-renew for a past_due membership", async () => {
    const { service, prisma } = makeService();
    prisma.userMembership.findUnique.mockResolvedValue(
      membership(tier(MembershipTierType.premium), {
        status: SubscriptionStatus.past_due,
        user: {
          businessStatus: BusinessStatus.approved,
          companyName: "Acme A.S.",
          taxId: "1234567890",
          savedCards: [{ id: "card-1" }],
        },
      }),
    );

    await expect(service.toggleAutoRenew("user-1", true)).rejects.toThrow(
      "Otomatik yenileme yalnız geçerli ücretli üyelikte açılabilir",
    );
    expect(prisma.userMembership.update).not.toHaveBeenCalled();
  });

  it("records a failed recurring charge without replacing the current membership", async () => {
    const { service, prisma, provider, config, providerEvents, virtualOrder } =
      makeService();
    const current = membership(tier(MembershipTierType.premium), {
      autoRenew: true,
      currentPeriodStart: new Date("2026-06-28T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-07-28T00:00:00.000Z"),
      user: {
        id: "user-1",
        displayName: "Test User",
        email: "user@example.com",
        phone: "+905551112233",
        businessStatus: BusinessStatus.approved,
        companyName: "Acme A.S.",
        taxId: "1234567890",
        savedCards: [
          {
            id: "card-1",
            utoken: "utoken",
            ctoken: "ctoken",
            last4: "4242",
            mandateIp: "127.0.0.1",
          },
        ],
      },
    });
    config.get.mockImplementation((key: string) =>
      key === "PAYTR_RECURRING_ENABLED" ? "true" : undefined,
    );
    prisma.userMembership.findMany.mockResolvedValue([current]);
    prisma.membershipPayment.create.mockResolvedValue({ id: "renewal-1" });
    provider.chargeRecurring.mockResolvedValue({
      status: "failed",
      reason: "temporary provider error",
      tryAgain: true,
      raw: { status: "failed" },
    });

    const result = await service.runAutoRenewals();

    expect(result).toEqual({ renewed: 0, failed: 1, attempted: 1 });
    expect(prisma.membershipPayment.update).toHaveBeenCalledWith({
      where: { id: "renewal-1" },
      data: expect.objectContaining({ status: PaymentStatus.failed }),
    });
    expect(prisma.userMembership.update).not.toHaveBeenCalled();
    expect(prisma.savedCard.update).not.toHaveBeenCalled();
    expect(
      virtualOrder.completeRecurringMembershipPayment,
    ).not.toHaveBeenCalled();
    expect(providerEvents.record).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipPaymentId: "renewal-1",
        status: "failed",
      }),
    );
  });
});
