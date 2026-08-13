import {
  BusinessStatus,
  MembershipTierType,
  OrderStatus,
  PaymentStatus,
  SavedCardStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PaymentProvider } from "../payment/dto";
import { MembershipSubscriptionService } from "./membership-subscription.service";
import { OUTBOX_SAVED_CARD_PROVIDER_DELETE } from "../outbox/outbox.types";

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
      savedCard: { update: jest.fn() },
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
    const outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const virtualOrder = {
      completeRecurringMembershipPayment: jest.fn(),
      failRecurringMembershipPayment: jest.fn(),
    };
    const notifications = {
      createInAppNotification: jest.fn().mockResolvedValue(true),
    };
    const service = new MembershipSubscriptionService(
      prisma as any,
      paymentService as any,
      paymentProviders as any,
      config as any,
      common as any,
      providerEvents as any,
      outbox as any,
      virtualOrder as any,
      undefined, // searchQueue
      notifications as any,
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
      outbox,
      virtualOrder,
      notifications,
    };
  };

  it("revokes a saved card locally and enqueues provider cleanup atomically", async () => {
    const { service, prisma, tx, outbox, provider } = makeService();
    prisma.savedCard.findFirst.mockResolvedValue({
      id: "card-1",
      userId: "user-1",
      utoken: "utoken-1",
      ctoken: "ctoken-1",
      status: SavedCardStatus.active,
    });
    await expect(service.deleteSavedCard("user-1", "card-1")).resolves.toEqual({
      deleted: true,
    });
    expect(provider.capiDeleteCard).not.toHaveBeenCalled();
    expect(tx.savedCard.update).toHaveBeenCalledWith({
      where: { id: "card-1" },
      data: { status: SavedCardStatus.revoked, isDefault: false },
    });
    expect(outbox.enqueue).toHaveBeenCalledWith(tx, {
      type: OUTBOX_SAVED_CARD_PROVIDER_DELETE,
      payload: { savedCardId: "card-1" },
      dedupeKey: "saved-card-provider-delete:card-1",
    });
  });

  it("keeps deletion idempotent while ensuring cleanup is enqueued", async () => {
    const { service, prisma, tx, outbox } = makeService();
    prisma.savedCard.findFirst.mockResolvedValue({
      id: "card-1",
      userId: "user-1",
      utoken: "utoken-1",
      ctoken: "ctoken-1",
      status: SavedCardStatus.revoked,
    });

    await expect(service.deleteSavedCard("user-1", "card-1")).resolves.toEqual({
      deleted: true,
    });
    expect(tx.savedCard.update).not.toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        dedupeKey: "saved-card-provider-delete:card-1",
      }),
    );
  });

  it("does not persist a local-only revoke when cleanup cannot be enqueued", async () => {
    const { service, prisma, outbox } = makeService();
    prisma.savedCard.findFirst.mockResolvedValue({
      id: "card-1",
      userId: "user-1",
      utoken: "utoken-1",
      ctoken: "ctoken-1",
      status: SavedCardStatus.active,
    });
    outbox.enqueue.mockRejectedValue(new Error("database unavailable"));

    await expect(service.deleteSavedCard("user-1", "card-1")).rejects.toThrow(
      "database unavailable",
    );
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

  it("onaylı kurumsal hesap Business dışı paket isterse yön-özel mesaj alır", async () => {
    const { service, prisma, paymentService } = makeService();
    prisma.membershipTier.findUnique.mockResolvedValue(
      tier(MembershipTierType.premium),
    );
    prisma.user.findUnique.mockResolvedValue({
      businessStatus: BusinessStatus.approved,
      companyName: "Acme A.S.",
      taxId: "1234567890",
    });

    const err = await service
      .subscribe("user-1", {
        tierType: MembershipTierType.premium,
        billingPeriod: "monthly",
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    // "Business şirketlere özel" mesajı bu yönü açıklamaz — ayrı anahtar.
    expect(err.getResponse()).toMatchObject({
      i18nKey: "server.membership.corporateMustUseBusinessTier",
    });
    expect(paymentService.initiatePayment).not.toHaveBeenCalled();
  });

  describe("D2 — planlı (dönem sonu) geçiş kapısı", () => {
    const individual = {
      businessStatus: null,
      companyName: null,
      taxId: null,
    };

    const setupDowngrade = (
      target: ReturnType<typeof tier>,
      harness: ReturnType<typeof makeService>,
    ) => {
      harness.prisma.membershipTier.findUnique.mockResolvedValue(target);
      harness.prisma.user.findUnique.mockResolvedValue(individual);
      harness.prisma.userMembership.findUnique.mockResolvedValue(
        membership(tier(MembershipTierType.premium), { user: individual }),
      );
    };

    it("ücretli hedef: recurring kapalıysa plan yazılmaz, yeniden-satın-al mesajı döner", async () => {
      const harness = makeService();
      setupDowngrade(tier(MembershipTierType.basic), harness);
      // config.get default'u undefined → PAYTR_RECURRING_ENABLED kapalı.

      const err = await harness.service
        .subscribe("user-1", {
          tierType: MembershipTierType.basic,
          billingPeriod: "monthly",
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({
        i18nKey: "server.membership.scheduledChangeRequiresCard",
      });
      expect(harness.prisma.userMembership.update).not.toHaveBeenCalled();
    });

    it("ücretli hedef: flag açık ama kullanılabilir kart yoksa yine reddedilir", async () => {
      const harness = makeService();
      setupDowngrade(tier(MembershipTierType.basic), harness);
      harness.config.get.mockImplementation((key: string) =>
        key === "PAYTR_RECURRING_ENABLED" ? "true" : undefined,
      );
      harness.prisma.savedCard.findFirst.mockResolvedValue(null);

      const err = await harness.service
        .subscribe("user-1", {
          tierType: MembershipTierType.basic,
          billingPeriod: "monthly",
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({
        i18nKey: "server.membership.scheduledChangeRequiresCard",
      });
      expect(harness.prisma.userMembership.update).not.toHaveBeenCalled();
    });

    it("ücretli hedef: flag + kullanılabilir kart varsa plan yazılır", async () => {
      const harness = makeService();
      setupDowngrade(tier(MembershipTierType.basic), harness);
      harness.config.get.mockImplementation((key: string) =>
        key === "PAYTR_RECURRING_ENABLED" ? "true" : undefined,
      );
      harness.prisma.savedCard.findFirst.mockResolvedValue({ id: "card-1" });

      await harness.service.subscribe("user-1", {
        tierType: MembershipTierType.basic,
        billingPeriod: "monthly",
      });

      expect(harness.prisma.userMembership.update).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: expect.objectContaining({
          scheduledTierType: MembershipTierType.basic,
          scheduledBillingPeriod: "monthly",
          autoRenew: true,
        }),
      });
    });

    it("free hedef: kartsız/flag'siz de her zaman planlanabilir", async () => {
      const harness = makeService();
      setupDowngrade(tier(MembershipTierType.free), harness);

      await harness.service.subscribe("user-1", {
        tierType: MembershipTierType.free,
        billingPeriod: "monthly",
      });

      expect(harness.prisma.savedCard.findFirst).not.toHaveBeenCalled();
      expect(harness.prisma.userMembership.update).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        data: expect.objectContaining({
          scheduledTierType: MembershipTierType.free,
          autoRenew: false,
        }),
      });
    });
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

  describe("D3 — süre dolmadan çekim + dönem ekleme (append)", () => {
    const renewalHarness = (currentPeriodEnd: Date) => {
      const harness = makeService();
      const periodStart = new Date(
        currentPeriodEnd.getTime() - 30 * 24 * 60 * 60 * 1000,
      );
      const current = membership(tier(MembershipTierType.premium), {
        autoRenew: true,
        currentPeriodStart: periodStart,
        currentPeriodEnd,
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
      harness.config.get.mockImplementation((key: string) =>
        key === "PAYTR_RECURRING_ENABLED" ? "true" : undefined,
      );
      harness.prisma.userMembership.findMany.mockResolvedValue([current]);
      harness.prisma.membershipPayment.create.mockResolvedValue({
        id: "renewal-1",
      });
      harness.provider.chargeRecurring.mockResolvedValue({
        status: "success",
        raw: { status: "success" },
      });
      harness.virtualOrder.completeRecurringMembershipPayment.mockResolvedValue(
        true,
      );
      return harness;
    };

    it("seçim penceresi dönem sonuna 1 saat kalanları da kapsar", async () => {
      const oldEnd = new Date(Date.now() + 30 * 60 * 1000);
      const { service, prisma } = renewalHarness(oldEnd);
      const before = Date.now();

      await service.runAutoRenewals();

      const where = prisma.userMembership.findMany.mock.calls[0][0].where;
      const lte: Date = where.currentPeriodEnd.lte;
      // now + 1 saat (çağrı süresi toleransıyla)
      expect(lte.getTime()).toBeGreaterThanOrEqual(before + 59 * 60 * 1000);
      expect(lte.getTime()).toBeLessThanOrEqual(Date.now() + 61 * 60 * 1000);
    });

    it("süre dolmadan çekimde yeni dönem ESKİ dönem sonundan başlar", async () => {
      const oldEnd = new Date(Date.now() + 30 * 60 * 1000);
      const harness = renewalHarness(oldEnd);

      const result = await harness.service.runAutoRenewals();

      expect(result.renewed).toBe(1);
      const data =
        harness.prisma.membershipPayment.create.mock.calls[0][0].data;
      expect(data.periodStart).toEqual(oldEnd);
      const expectedEnd = new Date(oldEnd);
      expectedEnd.setMonth(expectedEnd.getMonth() + 1);
      expect(data.periodEnd).toEqual(expectedEnd);
    });

    it("2 gündür süresi geçmiş (bayat) satırda yeni dönem now'dan başlar", async () => {
      const oldEnd = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const harness = renewalHarness(oldEnd);
      const before = Date.now();

      const result = await harness.service.runAutoRenewals();

      expect(result.renewed).toBe(1);
      const data =
        harness.prisma.membershipPayment.create.mock.calls[0][0].data;
      const start: Date = data.periodStart;
      // Eski uca eklemek dönemi geçmişe kurardı; taban çekim anıdır.
      expect(start.getTime()).toBeGreaterThanOrEqual(before);
      expect(start.getTime()).toBeLessThanOrEqual(Date.now());
      const expectedEnd = new Date(start);
      expectedEnd.setMonth(expectedEnd.getMonth() + 1);
      expect(data.periodEnd).toEqual(expectedEnd);
    });
  });

  describe("checkExpiredMemberships", () => {
    it("free'ye düşen üyeye MEMBERSHIP_EXPIRED bildirimi gönderir", async () => {
      const { service, prisma, notifications } = makeService();
      prisma.userMembership.findMany.mockResolvedValue([
        {
          id: "membership-1",
          userId: "user-1",
          tier: { name: "Premium Üyelik" },
        },
      ]);
      prisma.membershipTier.findUnique.mockResolvedValue({
        id: "free-tier",
        type: MembershipTierType.free,
        // canTrade=true → pending takas iptali dalına girilmez (o dal ayrı test edilir).
        canTrade: true,
      });
      prisma.userMembership.update.mockResolvedValue({});

      const count = await service.checkExpiredMemberships();

      expect(count).toBe(1);
      expect(prisma.userMembership.update).toHaveBeenCalledWith({
        where: { id: "membership-1" },
        data: expect.objectContaining({
          tierId: "free-tier",
          autoRenew: false,
        }),
      });
      expect(notifications.createInAppNotification).toHaveBeenCalledWith(
        "user-1",
        "membership_expired",
        { tierName: "Premium Üyelik" },
      );
    });

    it("bildirim hatası düşürmeyi geri almaz", async () => {
      const { service, prisma, notifications } = makeService();
      prisma.userMembership.findMany.mockResolvedValue([
        { id: "membership-1", userId: "user-1", tier: { name: "Premium" } },
      ]);
      prisma.membershipTier.findUnique.mockResolvedValue({
        id: "free-tier",
        canTrade: true,
      });
      prisma.userMembership.update.mockResolvedValue({});
      notifications.createInAppNotification.mockRejectedValue(
        new Error("push down"),
      );

      await expect(service.checkExpiredMemberships()).resolves.toBe(1);
    });
  });
});
