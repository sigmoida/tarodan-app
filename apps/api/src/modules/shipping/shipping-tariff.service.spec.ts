import { ServiceUnavailableException } from "@nestjs/common";
import { ShippingPackageTierCode, ShippingTariffStatus } from "@prisma/client";
import { ShippingTariffService } from "./shipping-tariff.service";

describe("ShippingTariffService active tariff", () => {
  const validTiers = [
    {
      code: ShippingPackageTierCode.small,
      label: "Küçük Paket",
      minDesi: 0,
      maxDesi: 2,
      amount: 100,
    },
    {
      code: ShippingPackageTierCode.medium,
      label: "Orta Paket",
      minDesi: 2,
      maxDesi: 5,
      amount: 130,
    },
    {
      code: ShippingPackageTierCode.large,
      label: "Büyük Paket",
      minDesi: 5,
      maxDesi: null,
      amount: 160,
    },
  ];

  const tariff = (version: number, over: Record<string, any> = {}) =>
    ({
      id: `tariff-${version}`,
      provider: "surat",
      status: ShippingTariffStatus.active,
      version,
      outboundPackageFee: 30 + version,
      freeShippingEnabled: true,
      freeShippingThreshold: 500,
      returnPackageFee: 30,
      tradeLegFee: 30,
      packageTiers: validTiers,
      ...over,
    }) as any;

  const draft = (over: Record<string, any> = {}) =>
    tariff(3, { status: ShippingTariffStatus.draft, ...over });

  const activationPrisma = (tariffRow: any) =>
    ({
      shippingTariff: { findUnique: jest.fn().mockResolvedValue(tariffRow) },
    }) as any;

  it("reads the active row for every request so sibling instances cannot stay stale", async () => {
    const prisma = {
      shippingTariff: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(tariff(1))
          .mockResolvedValueOnce(tariff(2)),
      },
    } as any;
    const service = new ShippingTariffService(prisma);

    expect((await service.getActiveTariff()).version).toBe(1);
    expect((await service.getActiveTariff()).version).toBe(2);
    expect(prisma.shippingTariff.findFirst).toHaveBeenCalledTimes(2);
  });

  it("fails closed when no active tariff can be snapshotted", async () => {
    const prisma = {
      shippingTariff: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;
    const service = new ShippingTariffService(prisma);

    await expect(service.getActiveOutboundTariff()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  /**
   * Aktifleştirme guard'ı kademe sözleşmesini korur. Kademesiz ya da boşluklu bir
   * tarife aktifleşirse checkout fiyat çözemez (fail-closed 503) — yani bu guard
   * satışın durmasını ENGELLEYEN son savunmadır.
   */
  describe("activation guard", () => {
    it("kademe tanımlanmamışsa aktifleştirmeyi reddeder", async () => {
      const service = new ShippingTariffService(
        activationPrisma(draft({ packageTiers: [] })),
      );

      await expect(
        service.activate("tariff-3", "admin-1"),
      ).rejects.toMatchObject({
        response: { code: "SHIPPING_PACKAGE_TIERS_REQUIRED" },
      });
    });

    it("üç kademenin tamamı yoksa reddeder", async () => {
      const service = new ShippingTariffService(
        activationPrisma(draft({ packageTiers: validTiers.slice(0, 2) })),
      );

      await expect(
        service.activate("tariff-3", "admin-1"),
      ).rejects.toMatchObject({
        response: { code: "SHIPPING_PACKAGE_TIERS_REQUIRED" },
      });
    });

    it("aralıklarda boşluk varsa reddeder", async () => {
      const gapped = [
        { ...validTiers[0], maxDesi: 2 },
        { ...validTiers[1], minDesi: 3, maxDesi: 5 }, // 2→3 boşluk
        validTiers[2],
      ];
      const service = new ShippingTariffService(
        activationPrisma(draft({ packageTiers: gapped })),
      );

      await expect(
        service.activate("tariff-3", "admin-1"),
      ).rejects.toMatchObject({
        response: { code: "SHIPPING_PACKAGE_TIER_RANGES_INVALID" },
      });
    });

    it("aralıklar çakışıyorsa reddeder", async () => {
      const overlapping = [
        { ...validTiers[0], maxDesi: 3 },
        { ...validTiers[1], minDesi: 2, maxDesi: 5 },
        validTiers[2],
      ];
      const service = new ShippingTariffService(
        activationPrisma(draft({ packageTiers: overlapping })),
      );

      await expect(
        service.activate("tariff-3", "admin-1"),
      ).rejects.toMatchObject({
        response: { code: "SHIPPING_PACKAGE_TIER_RANGES_INVALID" },
      });
    });

    it("son kademe üst sınırlıysa reddeder (fiyatsız desi kalmasın)", async () => {
      const bounded = [
        validTiers[0],
        validTiers[1],
        { ...validTiers[2], maxDesi: 10 },
      ];
      const service = new ShippingTariffService(
        activationPrisma(draft({ packageTiers: bounded })),
      );

      await expect(
        service.activate("tariff-3", "admin-1"),
      ).rejects.toMatchObject({
        response: { code: "SHIPPING_PACKAGE_TIER_RANGES_INVALID" },
      });
    });

    it("ilk kademe 0'dan başlamıyorsa reddeder", async () => {
      const service = new ShippingTariffService(
        activationPrisma(
          draft({
            packageTiers: [
              { ...validTiers[0], minDesi: 1 },
              validTiers[1],
              validTiers[2],
            ],
          }),
        ),
      );

      await expect(
        service.activate("tariff-3", "admin-1"),
      ).rejects.toMatchObject({
        response: { code: "SHIPPING_PACKAGE_TIER_RANGES_INVALID" },
      });
    });

    it("negatif tutar reddeder", async () => {
      const service = new ShippingTariffService(
        activationPrisma(
          draft({
            packageTiers: [
              { ...validTiers[0], amount: -1 },
              validTiers[1],
              validTiers[2],
            ],
          }),
        ),
      );

      await expect(
        service.activate("tariff-3", "admin-1"),
      ).rejects.toMatchObject({
        response: { code: "SHIPPING_PACKAGE_TIER_RANGES_INVALID" },
      });
    });

    it("geçerli kademelerle aktifleştirir ve mevcut aktifi arşivler", async () => {
      const tx = {
        shippingTariff: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update: jest
            .fn()
            .mockResolvedValue(
              tariff(3, { status: ShippingTariffStatus.active }),
            ),
        },
      };
      const prisma = {
        shippingTariff: { findUnique: jest.fn().mockResolvedValue(draft()) },
        $transaction: jest.fn(async (fn: any) => fn(tx)),
      } as any;
      const service = new ShippingTariffService(prisma);

      const activated = await service.activate("tariff-3", "admin-1");

      expect(activated.status).toBe(ShippingTariffStatus.active);
      // Aktif olan ÖNCE arşivlenir (partial-unique index sağlanır).
      expect(tx.shippingTariff.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ShippingTariffStatus.archived,
          }),
        }),
      );
    });
  });

  describe("clone", () => {
    it("aktif tarifeyi kademeleriyle yeni bir draft'a kopyalar", async () => {
      const created = tariff(4, { status: ShippingTariffStatus.draft });
      const prisma = {
        shippingTariff: {
          findFirst: jest
            .fn()
            // getActiveTariff → kaynak
            .mockResolvedValueOnce(tariff(3))
            // son sürüm araması
            .mockResolvedValueOnce({ version: 3 }),
          create: jest.fn().mockResolvedValue(created),
        },
      } as any;
      const service = new ShippingTariffService(prisma);

      await service.cloneActive("admin-1");

      const data = prisma.shippingTariff.create.mock.calls[0][0].data;
      expect(data.status).toBe(ShippingTariffStatus.draft);
      expect(data.version).toBe(4);
      // Kademeler örnek ölçüleriyle birlikte taşınır → admin sıfırdan girmez.
      expect(data.packageTiers.create).toHaveLength(3);
      expect(data.packageTiers.create[0]).toMatchObject({
        code: ShippingPackageTierCode.small,
        amount: 100,
      });
    });
  });
});
