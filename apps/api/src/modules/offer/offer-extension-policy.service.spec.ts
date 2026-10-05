import { BadRequestException } from "@nestjs/common";
import { OfferStatus, ProductStatus } from "@prisma/client";
import { OfferExtensionPolicy } from "./offer-extension-policy.service";
import { OfferService } from "./offer.service";
import { AdminOfferQueryService } from "../admin/orders/admin-offer-query.service";
import { offerEffectiveStatus } from "../admin/orders/helpers/offer-effective-status";

/**
 * Süresi geçmiş ama cron'un uzatacağı teklif "expired" gösterilmez / reddedilmez;
 * uzatılmayacak teklif bugünkü gibi reddedilir. Üç tüketici (kullanıcı
 * ekranı + kabul/karşı teklif, admin görünen durumu, cron) aynı
 * `OfferExtensionPolicy`'yi çağırır.
 */
describe("OfferExtensionPolicy ve tüketicileri", () => {
  const NOW = new Date("2026-10-05T12:00:00.000Z");

  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  const lapsedOffer = (patch: Record<string, unknown> = {}) => ({
    id: "of1",
    status: OfferStatus.pending,
    expiresAt: new Date(NOW.getTime() - 60_000),
    extendedAt: null,
    buyerId: "b1",
    sellerId: "s1",
    product: {
      status: ProductStatus.active,
      quantity: null,
      reservedQuantity: 0,
    },
    buyer: { isBanned: false, deletedAt: null },
    seller: { isBanned: false, deletedAt: null },
    ...patch,
  });

  const makePolicy = (
    offer: ReturnType<typeof lapsedOffer> | null,
    action: string | null = "extend_once",
    blocked = false,
  ) => {
    const prisma = {
      platformSetting: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            action ? { settingValue: action, updatedBy: "admin" } : null,
          ),
      },
      offer: { findUnique: jest.fn().mockResolvedValue(offer) },
    };
    const userBlocks = {
      isBlockedEither: jest.fn().mockResolvedValue(blocked),
    };
    return new OfferExtensionPolicy(prisma as never, userBlocks as never);
  };

  describe("willExtend", () => {
    it("eylem extend_once, hak kullanılmamış, engel yok → uzatılacak", async () => {
      await expect(makePolicy(lapsedOffer()).willExtend("of1")).resolves.toBe(
        true,
      );
    });

    it.each([
      ["varsayılan eylem (expire)", () => makePolicy(lapsedOffer(), null)],
      [
        "hak kullanılmış",
        () => makePolicy(lapsedOffer({ extendedAt: new Date() })),
      ],
      [
        "ilan satışta değil",
        () =>
          makePolicy(
            lapsedOffer({
              product: {
                status: ProductStatus.sold,
                quantity: null,
                reservedQuantity: 0,
              },
            }),
          ),
      ],
      [
        "taraf yasaklı",
        () =>
          makePolicy(
            lapsedOffer({ seller: { isBanned: true, deletedAt: null } }),
          ),
      ],
      [
        "taraflar engelli",
        () => makePolicy(lapsedOffer(), "extend_once", true),
      ],
      [
        "süresi henüz geçmemiş",
        () =>
          makePolicy(
            lapsedOffer({ expiresAt: new Date(NOW.getTime() + 1000) }),
          ),
      ],
      [
        "pending değil",
        () => makePolicy(lapsedOffer({ status: OfferStatus.accepted })),
      ],
      ["teklif yok", () => makePolicy(null)],
    ])("%s → uzatılmayacak", async (_label, build) => {
      await expect(build().willExtend("of1")).resolves.toBe(false);
    });
  });

  describe("admin görünen durumu (offerEffectiveStatus)", () => {
    const row = {
      status: OfferStatus.pending,
      expiresAt: new Date(NOW.getTime() - 60_000),
    };

    it("uzatılacak teklif pending kalır", () => {
      expect(offerEffectiveStatus(row, NOW, true)).toBe(OfferStatus.pending);
    });

    it("uzatılmayacak teklif bugünkü gibi expired görünür", () => {
      expect(offerEffectiveStatus(row, NOW, false)).toBe(OfferStatus.expired);
      expect(offerEffectiveStatus(row, NOW)).toBe(OfferStatus.expired);
    });

    it("admin liste satırı politikadan gelen kimliklerle pending gösterir", async () => {
      const adminRow = (id: string) => ({
        ...lapsedOffer({ id }),
        amount: 100,
        message: null,
        cancelReason: null,
        buyerMustAccept: false,
        version: 1,
        createdAt: NOW,
        updatedAt: NOW,
        productId: "p1",
        buyer: { id: "b1", isTestAccount: false },
        seller: { id: "s1", isTestAccount: false },
        product: {
          id: "p1",
          title: "x",
          price: 100,
          status: "active",
          images: [],
        },
        order: null,
      });
      const prisma: any = {
        offer: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              adminRow("extends"),
              adminRow("stays-expired"),
            ]),
          count: jest.fn().mockResolvedValue(2),
        },
        $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      };
      const policy = {
        willExtend: jest.fn(async (id: string) => id === "extends"),
      };
      const service = new AdminOfferQueryService(
        prisma,
        undefined,
        policy as never,
      );

      const result: any = await service.getOffers({} as any);

      expect(result.data.map((o: any) => [o.id, o.status])).toEqual([
        ["extends", OfferStatus.pending],
        ["stays-expired", OfferStatus.expired],
      ]);
    });
  });

  describe("OfferService (kullanıcı ekranı ve kabul/karşı teklif)", () => {
    const makeService = (willExtend: boolean) => {
      const policy = { willExtend: jest.fn().mockResolvedValue(willExtend) };
      const service = new OfferService(
        { platformSetting: { findUnique: jest.fn() } } as never,
        {} as never,
        { get: () => undefined } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        undefined as never,
        {} as never,
        {} as never,
        undefined,
        policy as never,
      );
      return { service, policy };
    };

    it("süresi geçmiş ama uzatılacak teklif 'expired' sunulmaz, sayaç 00:00:00", async () => {
      const { service } = makeService(true);
      const res: any = await (service as any).formatOfferResponse({
        ...lapsedOffer(),
        amount: 10,
        product: { id: "p1", title: "x", price: 10, status: "active" },
        buyer: null,
        seller: null,
      });
      expect(res.isExpired).toBe(false);
      expect(res.status).toBe(OfferStatus.pending);
      expect(res.timeRemaining).toBe("00:00:00");
    });

    it("süresi geçmiş ve uzatılmayacak teklif bugünkü gibi expired sunulur", async () => {
      const { service } = makeService(false);
      const res: any = await (service as any).formatOfferResponse({
        ...lapsedOffer(),
        amount: 10,
        product: { id: "p1", title: "x", price: 10, status: "active" },
        buyer: null,
        seller: null,
      });
      expect(res.isExpired).toBe(true);
      expect(res.status).toBe(OfferStatus.expired);
    });

    it("uzatılmayacak teklifte kabul/karşı teklif kapısı (hasLapsed) reddeder", async () => {
      const { service, policy } = makeService(false);
      await expect(
        (service as any).hasLapsed("of1", lapsedOffer().expiresAt),
      ).resolves.toBe(true);
      expect(policy.willExtend).toHaveBeenCalledWith("of1", expect.any(Date));
    });

    it("uzatılacak teklifte kapı reddetmez", async () => {
      const { service } = makeService(true);
      await expect(
        (service as any).hasLapsed("of1", lapsedOffer().expiresAt),
      ).resolves.toBe(false);
    });

    it("süresi geçmemiş teklifte politikaya hiç sorulmaz", async () => {
      const { service, policy } = makeService(false);
      await expect(
        (service as any).hasLapsed("of1", new Date(NOW.getTime() + 1000)),
      ).resolves.toBe(false);
      expect(policy.willExtend).not.toHaveBeenCalled();
    });

    it("politika yoksa (eski kurulum) bugünkü davranış: dolmuş", async () => {
      const service = new OfferService(
        {} as never,
        {} as never,
        { get: () => undefined } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        undefined as never,
        {} as never,
        {} as never,
      );
      await expect(
        (service as any).hasLapsed("of1", lapsedOffer().expiresAt),
      ).resolves.toBe(true);
    });

    it("karşı teklif uzatılmayacak dolmuş teklifte hâlâ offerExpired fırlatır", async () => {
      const { service } = makeService(false);
      const tx = {
        offer: {
          findUnique: jest.fn().mockResolvedValue({
            ...lapsedOffer(),
            sellerId: "s1",
            buyerMustAccept: false,
            product: { id: "p1" },
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      (service as any).prisma = {
        $transaction: jest.fn((fn: any) => fn(tx)),
        platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      (service as any).userBlocks = {
        assertNotBlocked: jest.fn().mockResolvedValue(undefined),
      };

      await expect(
        service.counter("of1", "s1", { amount: 20 } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
