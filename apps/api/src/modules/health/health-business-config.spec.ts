import {
  CommissionAppliesTo,
  CommissionSellerType,
  CommissionTaxpayerType,
  MembershipTierType,
} from "@prisma/client";
import { HealthService } from "./health.service";

/**
 * BLOCKER: readiness "iş yapılandırması" kontrolü yalnızca `commissionRule`
 * SAYISINA bakıyordu. Yalnız kategoriye özel kurallardan oluşan bir konfigürasyon
 * sağlıklı görünürken diğer tüm kategorilerin checkout'u fail-closed 503 verir.
 * Kontrol, en az bir AKTİF catch-all (her eksende wildcard + appliesTo=BOTH)
 * kuralın varlığını doğrulamalıdır.
 */
describe("HealthService — business config requires an active catch-all commission rule", () => {
  const catchAll = (over: Partial<any> = {}) => ({
    id: "catch-all",
    categoryId: null,
    sellerType: CommissionSellerType.ALL,
    taxpayerType: CommissionTaxpayerType.all,
    minAmount: null,
    maxAmount: null,
    appliesTo: CommissionAppliesTo.BOTH,
    isActive: true,
    ...over,
  });

  const makeService = (
    commissionRules: any[],
    packageTiers: Array<{ code: string }> | null = [
      { code: "small" },
      { code: "medium" },
      { code: "large" },
    ],
  ) => {
    const prisma = {
      membershipTier: { count: jest.fn().mockResolvedValue(4) },
      commissionRule: {
        count: jest.fn().mockResolvedValue(commissionRules.length),
        findMany: jest.fn().mockResolvedValue(commissionRules),
      },
      taxRule: { count: jest.fn().mockResolvedValue(1) },
      shippingTariff: {
        // Aktif tarife üç kademesiyle birlikte hazır sayılır; eksik kademe
        // checkout'un fiyat çözememesi demektir.
        findFirst: jest
          .fn()
          .mockResolvedValue(packageTiers ? { id: "t1", packageTiers } : null),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: "platform" }) },
    };
    const service = new HealthService(
      prisma as any,
      { get: () => undefined } as any,
      {} as any,
    );
    return { service, prisma };
  };

  const callCheck = (service: HealthService): Promise<boolean> =>
    (service as any).checkBusinessConfig();

  const originalEnv = process.env.NODE_ENV;
  beforeAll(() => {
    // Kontrol yalnız production'da uygulanır.
    process.env.NODE_ENV = "production";
  });
  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("aktif catch-all kural varsa hazır kabul edilir", async () => {
    const { service } = makeService([catchAll()]);
    await expect(callCheck(service)).resolves.toBe(true);
  });

  it("yalnız kategoriye özel kurallar varsa hazır DEĞİLDİR", async () => {
    const { service } = makeService([catchAll({ categoryId: "c1" })]);
    await expect(callCheck(service)).resolves.toBe(false);
  });

  it("catch-all yalnız alıcı tarafına uygulanıyorsa hazır DEĞİLDİR", async () => {
    const { service } = makeService([
      catchAll({ appliesTo: CommissionAppliesTo.BUYER }),
    ]);
    await expect(callCheck(service)).resolves.toBe(false);
  });

  it("hiç kural yoksa hazır DEĞİLDİR", async () => {
    const { service } = makeService([]);
    await expect(callCheck(service)).resolves.toBe(false);
  });

  it("aktif tarifenin kademeleri eksikse hazır DEĞİLDİR", async () => {
    // Kademesiz/eksik kademeli tarife "aktif" görünür ama checkout hiçbir desi
    // için fiyat çözemez → hazır sayılmamalı.
    const { service } = makeService([catchAll()], [{ code: "small" }]);
    await expect(callCheck(service)).resolves.toBe(false);
  });

  it("aktif tarife yoksa hazır DEĞİLDİR", async () => {
    const { service } = makeService([catchAll()], null);
    await expect(callCheck(service)).resolves.toBe(false);
  });

  it("üyelik katmanları eksikse yine hazır DEĞİLDİR (mevcut kontroller korunur)", async () => {
    const { service, prisma } = makeService([catchAll()]);
    prisma.membershipTier.count.mockResolvedValue(3);
    void MembershipTierType.free;
    await expect(callCheck(service)).resolves.toBe(false);
  });
});
