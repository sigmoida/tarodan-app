import { Prisma } from "@prisma/client";
import { PrismaService } from "../../src/prisma";
import { OrderService } from "../../src/modules/order/order.service";
import { OrderPricingService } from "../../src/modules/order/order-pricing.service";
import { CommissionLedgerService } from "../../src/modules/commission/commission-ledger.service";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import { testTaxPolicy } from "../../src/modules/order/testing/tax-policy-fixture";

/**
 * Faz 5.2 — calculateCommission BUYER + SELLER ayrı lookup unit testleri.
 * Spec Bölüm 8 + 14.4 — refactor sonrası 7 senaryo.
 */
describe("OrderService.calculateCommission (BUYER + SELLER ayrı lookup) (E2E)", () => {
  let prisma: PrismaService;
  let ledger: CommissionLedgerService;
  let sellerId: string;
  let categoryId: string;

  function makeOrderService(): OrderService {
    // Order refactor sonrası: calculateCommission OrderPricingService'e taşındı
    // (byte-identical), OrderService facade delege ediyor. Aynı davranışı test etmek
    // için facade'ı gerçek bir OrderPricingService(prisma, taxStub) ile kuruyoruz;
    // calculateCommission ledger kullanmadığından diğer alt-servisler stub.
    const taxStub = {
      resolveTaxRate: async () => null,
      calculateTaxAmount: () => 0,
    } as any; // taxService (no-tax stub)
    const shippingTariffs = {
      getActiveOutboundTariff: async () => ({
        outboundPackageFee: 29.99,
        freeShippingEnabled: true,
        freeShippingThreshold: 500,
      }),
    } as any;
    const pricing = new OrderPricingService(
      prisma,
      taxStub,
      shippingTariffs,
      {
        getEffectiveDisplayPrice: async () => null,
        getEffectiveDisplayPriceMany: async () => new Map(),
      } as any,
      testTaxPolicy(),
    );
    return new OrderService(pricing, {} as any, {} as any, {} as any);
  }

  beforeAll(() => {
    prisma = getPrisma() as unknown as PrismaService;
    ledger = new CommissionLedgerService(prisma);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
    const baseline = await seedBaseline();
    categoryId = baseline.categoryId;
    // Test satıcısı (varsayılan: individual seller type, free tier baseline'dan)
    const seller = await prisma.user.create({
      data: {
        email: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@x`,
        passwordHash: "x",
        displayName: "Test Seller",
        isSeller: true,
        sellerType: "individual" as any,
      },
    });
    sellerId = seller.id;
  });

  it("1) Aktif rule yoksa fee=0", async () => {
    // Baseline'da commission_rules truncate edilmiş; aktif rule yok
    const svc = makeOrderService();
    const result = await svc.calculateCommission(1000, sellerId, categoryId);
    expect(result.sellerFeeAmount).toBe(0);
    expect(result.buyerFeeAmount).toBe(0);
    expect(result.commissionAmount).toBe(0);
  });

  it("2) Sadece SELLER rule (%5) — sellerFee=50, buyerFee=0", async () => {
    await prisma.commissionRule.create({
      data: {
        id: "seller-default",
        name: "Default Seller",
        ruleType: "default" as any,
        appliesTo: "SELLER" as any,
        sellerType: "ALL" as any,
        sellerRate: new Prisma.Decimal("5.0000"),
        percentage: new Prisma.Decimal("0.0500"),
        isActive: true,
        priority: 0,
      },
    });
    const svc = makeOrderService();
    const result = await svc.calculateCommission(1000, sellerId, categoryId);
    expect(result.sellerFeeAmount).toBe(50);
    expect(result.buyerFeeAmount).toBe(0);
    expect(result.commissionAmount).toBe(50);
  });

  it("3) Sadece BUYER rule (%3) — sellerFee=0, buyerFee=30", async () => {
    await prisma.commissionRule.create({
      data: {
        id: "buyer-fee-rule",
        name: "Buyer Fee",
        ruleType: "default" as any,
        appliesTo: "BUYER" as any,
        sellerType: "ALL" as any,
        buyerRate: new Prisma.Decimal("3.0000"),
        percentage: new Prisma.Decimal("0.0300"),
        isActive: true,
        priority: 0,
      },
    });
    const svc = makeOrderService();
    const result = await svc.calculateCommission(1000, sellerId, categoryId);
    expect(result.sellerFeeAmount).toBe(0);
    expect(result.buyerFeeAmount).toBe(30);
    expect(result.commissionAmount).toBe(30);
  });

  it("4) Hem SELLER (%5) hem BUYER (%3) ayrı rule — sellerFee=50, buyerFee=30, toplam=80", async () => {
    await prisma.commissionRule.create({
      data: {
        id: "seller-default",
        name: "Default Seller",
        ruleType: "default" as any,
        appliesTo: "SELLER" as any,
        sellerType: "ALL" as any,
        sellerRate: new Prisma.Decimal("5.0000"),
        percentage: new Prisma.Decimal("0.0500"),
        isActive: true,
        priority: 0,
      },
    });
    await prisma.commissionRule.create({
      data: {
        id: "buyer-fee-rule",
        name: "Buyer Fee",
        ruleType: "default" as any,
        appliesTo: "BUYER" as any,
        sellerType: "ALL" as any,
        buyerRate: new Prisma.Decimal("3.0000"),
        percentage: new Prisma.Decimal("0.0300"),
        isActive: true,
        priority: 0,
      },
    });
    const svc = makeOrderService();
    const result = await svc.calculateCommission(1000, sellerId, categoryId);
    expect(result.sellerFeeAmount).toBe(50);
    expect(result.buyerFeeAmount).toBe(30);
    expect(result.commissionAmount).toBe(80);
  });

  it("5) BUYER rule min uygulanır — amount=100, rate=3, min=5 → buyerFee=5", async () => {
    await prisma.commissionRule.create({
      data: {
        id: "buyer-fee-rule",
        name: "Buyer Fee with Min",
        ruleType: "default" as any,
        appliesTo: "BUYER" as any,
        sellerType: "ALL" as any,
        buyerRate: new Prisma.Decimal("3.0000"),
        buyerMin: new Prisma.Decimal("5.00"),
        percentage: new Prisma.Decimal("0.0300"),
        isActive: true,
        priority: 0,
      },
    });
    const svc = makeOrderService();
    const result = await svc.calculateCommission(100, sellerId, categoryId);
    // 100 * 3 / 100 = 3, min 5 → buyer=5
    expect(result.buyerFeeAmount).toBe(5);
  });

  it("6) BUYER rule max uygulanır — amount=10000, rate=3, max=50 → buyerFee=50", async () => {
    await prisma.commissionRule.create({
      data: {
        id: "buyer-fee-rule",
        name: "Buyer Fee with Max",
        ruleType: "default" as any,
        appliesTo: "BUYER" as any,
        sellerType: "ALL" as any,
        buyerRate: new Prisma.Decimal("3.0000"),
        buyerMax: new Prisma.Decimal("50.00"),
        percentage: new Prisma.Decimal("0.0300"),
        isActive: true,
        priority: 0,
      },
    });
    const svc = makeOrderService();
    const result = await svc.calculateCommission(10000, sellerId, categoryId);
    // 10000 * 3 / 100 = 300, max 50 → buyer=50
    expect(result.buyerFeeAmount).toBe(50);
  });

  it("7) isActive=false rule görmezden gelinir — fee=0", async () => {
    await prisma.commissionRule.create({
      data: {
        id: "buyer-fee-rule",
        name: "Inactive Buyer Rule",
        ruleType: "default" as any,
        appliesTo: "BUYER" as any,
        sellerType: "ALL" as any,
        buyerRate: new Prisma.Decimal("3.0000"),
        percentage: new Prisma.Decimal("0.0300"),
        isActive: false,
        priority: 0,
      },
    });
    const svc = makeOrderService();
    const result = await svc.calculateCommission(1000, sellerId, categoryId);
    expect(result.buyerFeeAmount).toBe(0);
    expect(result.sellerFeeAmount).toBe(0);
  });
});
