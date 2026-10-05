import {
  ListingRemovalReason,
  ProductInactiveReason,
  ProductStatus,
} from "@prisma/client";
import { ProductSchedulerService } from "./product-scheduler.service";

/**
 * İlan ömrü (`listingTtlDays`) ve uyarı günü (`listingExpiryWarningDays`)
 * Süreler ve Kurallar'dan her cron turunun başında okunur. Bitiş ilana
 * damgalanmaz: tur "şimdi − N gün" kesimini kullanır.
 */
describe("ProductSchedulerService — ilan ömrü süreleri", () => {
  const NOW = new Date("2026-10-05T04:00:00.000Z");
  const ORIGINAL = process.env.LISTING_TTL_DAYS;

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });
  beforeEach(() => {
    delete process.env.LISTING_TTL_DAYS;
  });
  afterAll(() => {
    jest.useRealTimers();
    if (ORIGINAL === undefined) delete process.env.LISTING_TTL_DAYS;
    else process.env.LISTING_TTL_DAYS = ORIGINAL;
  });

  const healthySeller = {
    id: "seller-1",
    displayName: "Satıcı",
    isBanned: false,
    businessStatus: null,
    companyName: null,
    taxId: null,
    membership: null,
  };

  const dueListing = (patch: Record<string, unknown> = {}) => ({
    id: "p1",
    title: "Hot Wheels Camaro",
    quantity: 2,
    seller: healthySeller,
    ...patch,
  });

  const makeService = (
    settings: Record<string, string> = {},
    due: ReturnType<typeof dueListing>[] = [],
  ) => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue(due),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // Kaldırma kaydı (recordListingRemovals) süre dolumuyla aynı tx'te.
      productRemovalEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      platformSetting: {
        findUnique: jest.fn(
          async ({ where }: { where: { settingKey: string } }) =>
            where.settingKey in settings
              ? { settingValue: settings[where.settingKey] }
              : null,
        ),
      },
      $transaction: jest.fn(),
    };
    // Etkileşimli tx: aynı istemciyle çalışır (yazımlar prisma mock'unda görünür).
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    const notifications = { sendTemplateEmailToUser: jest.fn() };
    const cache = {
      del: jest.fn().mockResolvedValue(undefined),
      delPattern: jest.fn().mockResolvedValue(0),
    };
    const search = { syncProduct: jest.fn().mockResolvedValue(undefined) };
    const service = new ProductSchedulerService(
      prisma as any,
      notifications as any,
      {} as any,
      cache as any,
      search as any,
    );
    return { service, prisma, notifications, cache, search };
  };

  /** Servisle aynı takvim aritmetiği: NOW − n gün (setDate). */
  const daysBefore = (days: number) => {
    const date = new Date(NOW);
    date.setDate(date.getDate() - days);
    return date;
  };

  /** Statü/ömür yazımları — kaldırma kaydının `removalReason` damgası hariç. */
  const statusWrites = (prisma: { product: { updateMany: jest.Mock } }) =>
    prisma.product.updateMany.mock.calls.filter(
      ([args]) => !("removalReason" in args.data),
    );

  const expiryCutoff = (prisma: { product: { updateMany: jest.Mock } }) =>
    prisma.product.updateMany.mock.calls[0][0].where.OR[0].publishedAt.lt;

  const warningBandEnd = (prisma: { product: { findMany: jest.Mock } }) =>
    prisma.product.findMany.mock.calls[0][0].where.OR[0].publishedAt.lt;

  it("admin değeri ve env yokken bugünkü gibi 60 gün", async () => {
    const { service, prisma } = makeService({}, [dueListing()]);
    await service.runExpireOldListings();
    expect(expiryCutoff(prisma)).toEqual(daysBefore(60));
  });

  it("env geri düşüşünü (LISTING_TTL_DAYS) okur", async () => {
    process.env.LISTING_TTL_DAYS = "90";
    const { service, prisma } = makeService({}, [dueListing()]);
    await service.runExpireOldListings();
    expect(expiryCutoff(prisma)).toEqual(daysBefore(90));
  });

  it("admin değeri env'i ezer", async () => {
    process.env.LISTING_TTL_DAYS = "90";
    const { service, prisma } = makeService({ listing_ttl_days: "30" }, [
      dueListing(),
    ]);
    await service.runExpireOldListings();
    expect(expiryCutoff(prisma)).toEqual(daysBefore(30));
  });

  it("uyarı bandı bugünkü gibi ömür − 7 günde biter (60 − 7 = 53)", async () => {
    const { service, prisma } = makeService();
    await service.runSendExpirationWarnings();
    expect(warningBandEnd(prisma)).toEqual(daysBefore(53));
  });

  it("uyarı bandı admin değerlerini izler (ömür 30, uyarı 3 → 27 gün)", async () => {
    const { service, prisma } = makeService({
      listing_ttl_days: "30",
      listing_expiry_warning_days: "3",
    });
    await service.runSendExpirationWarnings();
    expect(warningBandEnd(prisma)).toEqual(daysBefore(27));
  });

  describe("süre dolumu (deactivate) — 'süresi doldu' işareti", () => {
    it("ömrü dolan ilanı pasife alır VE nedenini expired olarak işaretler", async () => {
      const { service, prisma } = makeService({}, [dueListing()]);

      const result = await service.runExpireOldListings();

      expect(prisma.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "p1" }),
          data: {
            status: ProductStatus.inactive,
            inactiveReason: ProductInactiveReason.expired,
          },
        }),
      );
      expect(result.stats).toEqual({ expired: 1, renewed: 0 });
    });

    it("yazım ilan başına ve AYNI süre koşuluyla yapılır (az önce yenilenen ilan koşula uymaz)", async () => {
      const { service, prisma } = makeService({}, [dueListing()]);
      await service.runExpireOldListings();

      const where = prisma.product.updateMany.mock.calls[0][0].where;
      expect(where.status).toBe(ProductStatus.active);
      expect(where.OR).toEqual([
        { publishedAt: { lt: daysBefore(60) } },
        { publishedAt: null, createdAt: { lt: daysBefore(60) } },
      ]);
    });

    it("seçimle yazım arasında yenilenen ilana (0 satır) dokunulmaz, e-posta gitmez, dizin tazelenmez", async () => {
      const { service, prisma, notifications, search } = makeService({}, [
        dueListing(),
      ]);
      prisma.product.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.runExpireOldListings();

      expect(result.stats).toEqual({ expired: 0, renewed: 0 });
      expect(notifications.sendTemplateEmailToUser).not.toHaveBeenCalled();
      expect(search.syncProduct).not.toHaveBeenCalled();
    });

    it("'süresi doldu' e-postası satıcının süresi dolan sekmesine bağlanır", async () => {
      const { service, notifications } = makeService({}, [dueListing()]);
      await service.runExpireOldListings();

      expect(notifications.sendTemplateEmailToUser).toHaveBeenCalledWith(
        "seller-1",
        "listing-expired",
        expect.objectContaining({
          productTitle: "Hot Wheels Camaro",
          listingUrl: expect.stringMatching(
            /\/profile\/listings\?status=expired$/,
          ),
        }),
      );
    });

    it("süre dolumu bir kaldırma olayı olarak 'expired' nedeniyle kaydedilir (sistem, aktörsüz)", async () => {
      const { service, prisma } = makeService({}, [dueListing()]);

      await service.runExpireOldListings();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.productRemovalEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            productId: "p1",
            reason: ListingRemovalReason.expired,
            statusBefore: ProductStatus.active,
            statusAfter: ProductStatus.inactive,
            fromStorefront: true,
            actorUserId: null,
          }),
        ],
      });
      // İlanın güncel nedeni yalnız hâlâ pasifse damgalanır.
      expect(prisma.product.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["p1"] }, status: ProductStatus.inactive },
        data: { removalReason: ListingRemovalReason.expired },
      });
    });

    it("davranış işareti (inactiveReason = expired) statüyle AYNI yazımda kalır — yenileme akışı değişmez", async () => {
      const { service, prisma } = makeService({}, [dueListing()]);

      await service.runExpireOldListings();

      const [first] = statusWrites(prisma);
      expect(first[0].data).toEqual({
        status: ProductStatus.inactive,
        inactiveReason: ProductInactiveReason.expired,
      });
    });

    it("yazılmayan ilan (0 satır) için kaldırma kaydı düşülmez", async () => {
      const { service, prisma } = makeService({}, [dueListing()]);
      prisma.product.updateMany.mockResolvedValue({ count: 0 });

      await service.runExpireOldListings();

      expect(prisma.productRemovalEvent.createMany).not.toHaveBeenCalled();
    });

    it("pasife alınan ilan önbellekten ve arama dizininden düşürülür", async () => {
      const { service, cache, search } = makeService({}, [dueListing()]);
      await service.runExpireOldListings();

      expect(cache.del).toHaveBeenCalledWith("products:detail:p1");
      expect(cache.delPattern).toHaveBeenCalledWith("products:list:*");
      expect(search.syncProduct).toHaveBeenCalledWith("p1");
    });
  });

  describe("ilan başına hata yalıtımı", () => {
    it("bir ilanın yazımı patlarsa diğerleri yan etkileriyle işlenir ve tur yine de reddedilir", async () => {
      const { service, prisma, notifications, search } = makeService({}, [
        dueListing({ id: "a" }),
        dueListing({ id: "bad" }),
        dueListing({ id: "c" }),
      ]);
      prisma.product.updateMany.mockImplementation(
        async ({ where }: { where: { id: string } }) => {
          if (where.id === "bad") throw new Error("db down");
          return { count: 1 };
        },
      );

      await expect(service.runExpireOldListings()).rejects.toThrow(
        /1 ilan işlenemedi \(2 pasife alındı, 0 yenilendi\)/,
      );

      // Her ilan için bir süre dolumu yazımı denenir; başarılı ikisi ayrıca
      // kaldırma nedenini aynı tx'te ilana işler (recordListingRemovals).
      const expiryWrites = prisma.product.updateMany.mock.calls.filter(
        ([args]) => args.data.status !== undefined,
      );
      expect(expiryWrites).toHaveLength(3);
      expect(prisma.productRemovalEvent.createMany).toHaveBeenCalledTimes(2);
      expect(search.syncProduct.mock.calls.map((c) => c[0]).sort()).toEqual([
        "a",
        "c",
      ]);
      expect(notifications.sendTemplateEmailToUser).toHaveBeenCalledTimes(2);
    });

    it("hata sonrası bile önceki ilanın dizin/önbellek tazelemesi yapılır", async () => {
      const { service, prisma, cache } = makeService({}, [
        dueListing({ id: "a" }),
        dueListing({ id: "bad" }),
      ]);
      prisma.product.updateMany.mockImplementation(
        async ({ where }: { where: { id: string } }) => {
          if (where.id === "bad") throw new Error("db down");
          return { count: 1 };
        },
      );

      await expect(service.runExpireOldListings()).rejects.toThrow();

      expect(cache.del).toHaveBeenCalledWith("products:detail:a");
      expect(cache.del).not.toHaveBeenCalledWith("products:detail:bad");
    });

    it("auto_renew dalında da aynı: patlayan ilan sayılır, kalanlar yenilenir, tur reddedilir", async () => {
      const { service, prisma } = makeService(
        { listing_ttl_days_on_expiry: "auto_renew" },
        [dueListing({ id: "bad" }), dueListing({ id: "ok" })],
      );
      prisma.product.updateMany.mockImplementation(
        async ({ where }: { where: { id: string } }) => {
          if (where.id === "bad") throw new Error("db down");
          return { count: 1 };
        },
      );

      await expect(service.runExpireOldListings()).rejects.toThrow(
        /1 ilan işlenemedi \(0 pasife alındı, 1 yenilendi\)/,
      );
      expect(prisma.product.updateMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("auto_renew eylemi", () => {
    const autoRenew = { listing_ttl_days_on_expiry: "auto_renew" };

    it("satılabilir ilan pasife alınmaz, yerinde yenilenir (ömür baştan başlar)", async () => {
      const { service, prisma, notifications } = makeService(autoRenew, [
        dueListing(),
      ]);

      const result = await service.runExpireOldListings();

      expect(prisma.product.updateMany).toHaveBeenCalledTimes(1);
      const call = prisma.product.updateMany.mock.calls[0][0];
      expect(call.data).toEqual({ publishedAt: NOW });
      // Yerinde yenileme vitrinden düşürmez: kaldırma kaydı yok.
      expect(prisma.productRemovalEvent.createMany).not.toHaveBeenCalled();
      expect(call.data).not.toHaveProperty("status");
      expect(call.where.id).toBe("p1");
      expect(result.stats).toEqual({ expired: 0, renewed: 1 });
      // Günlük/yinelenen e-posta yok: yenilenen ilan için satıcıya hiçbir şey gitmez.
      expect(notifications.sendTemplateEmailToUser).not.toHaveBeenCalled();
    });

    it("stoğu bitmiş ilan yenilenmez: pasife alınır ve işaretlenir", async () => {
      const { service, prisma, notifications } = makeService(autoRenew, [
        dueListing({ quantity: 0 }),
      ]);

      const result = await service.runExpireOldListings();

      expect(prisma.product.updateMany.mock.calls[0][0].data).toEqual({
        status: ProductStatus.inactive,
        inactiveReason: ProductInactiveReason.expired,
      });
      expect(result.stats).toEqual({ expired: 1, renewed: 0 });
      expect(notifications.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
    });

    it("banlı satıcının ilanı yenilenmez", async () => {
      const { service, prisma } = makeService(autoRenew, [
        dueListing({ seller: { ...healthySeller, isBanned: true } }),
      ]);

      const result = await service.runExpireOldListings();

      expect(prisma.product.updateMany.mock.calls[0][0].data.status).toBe(
        ProductStatus.inactive,
      );
      expect(result.stats).toEqual({ expired: 1, renewed: 0 });
    });

    it("karışık turda her ilan kendi yoluna gider", async () => {
      const { service, prisma } = makeService(autoRenew, [
        dueListing({ id: "ok" }),
        dueListing({ id: "empty", quantity: 0 }),
      ]);

      const result = await service.runExpireOldListings();

      expect(result.stats).toEqual({ expired: 1, renewed: 1 });
      expect(statusWrites(prisma).map((c) => c[0].where.id)).toEqual([
        "ok",
        "empty",
      ]);
    });

    it("yenilenen ilan dizinden/önbellekten düşürülmez (statüsü değişmedi)", async () => {
      const { service, search } = makeService(autoRenew, [dueListing()]);
      await service.runExpireOldListings();
      expect(search.syncProduct).not.toHaveBeenCalled();
    });

    it("auto_renew açıkken 'süresi doluyor' uyarısı gönderilmez", async () => {
      const { service, prisma, notifications } = makeService(autoRenew);

      const result = await service.runSendExpirationWarnings();

      expect(prisma.product.findMany).not.toHaveBeenCalled();
      expect(notifications.sendTemplateEmailToUser).not.toHaveBeenCalled();
      expect(result.stats).toEqual({ sellers: 0, listings: 0 });
    });
  });

  describe("'süresi doluyor' uyarısı — bitiş tarihi yayın anından", () => {
    const publishedAt = new Date("2026-08-10T09:00:00.000Z");
    const createdAt = new Date("2026-03-01T09:00:00.000Z");

    const expiringListing = (patch: Record<string, unknown> = {}) => ({
      id: "p1",
      title: "Hot Wheels Camaro",
      createdAt,
      publishedAt,
      seller: { id: "seller-1", displayName: "Satıcı" },
      ...patch,
    });

    it("tarih createdAt'ten değil publishedAt'ten hesaplanır (yeniden onaylanmış ilan)", async () => {
      const { service, prisma, notifications } = makeService();
      prisma.product.findMany.mockResolvedValue([expiringListing()]);

      await service.runSendExpirationWarnings();

      const expected = new Date(publishedAt);
      expected.setDate(expected.getDate() + 60);
      const data = notifications.sendTemplateEmailToUser.mock.calls[0][2];
      expect(data.expirationDate).toBe(expected.toLocaleDateString("tr-TR"));
    });

    it("yayın anı yoksa (eski kayıt) createdAt'e düşer", async () => {
      const { service, prisma, notifications } = makeService();
      prisma.product.findMany.mockResolvedValue([
        expiringListing({ publishedAt: null }),
      ]);

      await service.runSendExpirationWarnings();

      const expected = new Date(createdAt);
      expected.setDate(expected.getDate() + 60);
      expect(
        notifications.sendTemplateEmailToUser.mock.calls[0][2].expirationDate,
      ).toBe(expected.toLocaleDateString("tr-TR"));
    });

    it("bitiş tarihi ömür değerini izler (30 gün)", async () => {
      const { service, prisma, notifications } = makeService({
        listing_ttl_days: "30",
        listing_expiry_warning_days: "3",
      });
      prisma.product.findMany.mockResolvedValue([expiringListing()]);

      await service.runSendExpirationWarnings();

      const expected = new Date(publishedAt);
      expected.setDate(expected.getDate() + 30);
      expect(
        notifications.sendTemplateEmailToUser.mock.calls[0][2].expirationDate,
      ).toBe(expected.toLocaleDateString("tr-TR"));
    });

    it("bağlantı ilan sayfasına değil 'ilanlarım'a gider (yenileme orada)", async () => {
      const { service, prisma, notifications } = makeService();
      prisma.product.findMany.mockResolvedValue([expiringListing()]);

      await service.runSendExpirationWarnings();

      expect(
        notifications.sendTemplateEmailToUser.mock.calls[0][2].listingUrl,
      ).toMatch(/\/profile\/listings$/);
    });
  });
});
