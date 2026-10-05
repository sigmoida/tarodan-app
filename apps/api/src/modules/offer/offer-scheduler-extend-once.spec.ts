import { OfferStatus, ProductStatus } from "@prisma/client";
import { OfferSchedulerService } from "./offer-scheduler.service";

/**
 * Süreler ve Kurallar → offerExpiryHours eylemi.
 *   - expire (varsayılan): süresi dolan teklif kapanır — bugünkü davranış.
 *   - extend_once: süre dolunca teklif BİR tam geçerlilik süresi uzatılır;
 *     ikinci dolumda expire. Hak `Offer.extendedAt` ile kayda yazılır ve
 *     uzatma koşullu-atomik bir updateMany'dir.
 * Bellek içi sahte tablo, where koşullarını gerçekten değerlendirir: eşzamanlı
 * tur testi bu yüzden anlamlıdır.
 */
describe("OfferSchedulerService — süre dolumu eylemi (extend_once)", () => {
  const T0 = new Date("2026-10-05T12:00:00.000Z");
  const HOUR = 60 * 60 * 1000;

  beforeEach(() => jest.useFakeTimers().setSystemTime(T0));
  afterEach(() => jest.useRealTimers());

  interface Row {
    id: string;
    buyerId: string;
    sellerId: string;
    productId: string;
    status: OfferStatus;
    buyerMustAccept: boolean;
    expiresAt: Date;
    extendedAt: Date | null;
    product: {
      title: string;
      status: ProductStatus;
      quantity: number | null;
      reservedQuantity: number | null;
    } | null;
    buyer: { isBanned: boolean; deletedAt: Date | null };
    seller: { isBanned: boolean; deletedAt: Date | null };
  }

  const offerRow = (patch: Partial<Row> = {}): Row => ({
    id: "offer-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    productId: "product-1",
    status: OfferStatus.pending,
    buyerMustAccept: false,
    // Süresi 1 dakika önce dolmuş.
    expiresAt: new Date(T0.getTime() - 60_000),
    extendedAt: null,
    product: {
      title: "Ürün",
      status: ProductStatus.active,
      quantity: null,
      reservedQuantity: 0,
    },
    buyer: { isBanned: false, deletedAt: null },
    seller: { isBanned: false, deletedAt: null },
    ...patch,
  });

  const makeHarness = (
    rows: Row[],
    settings: Record<string, string> = {},
    blocked = false,
  ) => {
    const matches = (row: Row, where: any): boolean =>
      (where.id === undefined || where.id === row.id) &&
      (where.status === undefined || where.status === row.status) &&
      (where.expiresAt?.lt === undefined ||
        row.expiresAt < where.expiresAt.lt) &&
      (where.extendedAt !== null || row.extendedAt === null);

    // Başarılı her yazım (kim ne yaptı) — çift uzatma/çift kapanış ayrımı için.
    const writes: string[] = [];
    const prisma = {
      platformSetting: {
        findUnique: jest.fn(
          async ({ where }: { where: { settingKey: string } }) =>
            where.settingKey in settings
              ? { settingValue: settings[where.settingKey], updatedBy: "admin" }
              : null,
        ),
      },
      offer: {
        findMany: jest.fn(async ({ where }: any) =>
          rows
            .filter((row) => matches(row, where))
            // Gerçek Prisma gibi: sonraki yazımlardan bağımsız anlık görüntü.
            .map((row) => ({ ...row })),
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const hit = rows.filter((row) => matches(row, where));
          for (const row of hit) {
            if (data.status) row.status = data.status;
            if (data.expiresAt) row.expiresAt = data.expiresAt;
            if (data.extendedAt) row.extendedAt = data.extendedAt;
            writes.push(row.id + ":" + (data.extendedAt ? "extend" : "expire"));
          }
          return { count: hit.length };
        }),
      },
    };
    const notificationService = {
      notifyOfferExpired: jest.fn().mockResolvedValue(undefined),
      notifyOfferExtended: jest.fn().mockResolvedValue(undefined),
    };
    const userBlocks = {
      isBlockedEither: jest.fn().mockResolvedValue(blocked),
    };
    const service = new OfferSchedulerService(
      prisma as any,
      {} as any,
      userBlocks as any,
      { get: () => undefined } as any,
      notificationService as any,
    );
    return { service, rows, writes, prisma, notificationService, userBlocks };
  };

  const EXTEND = { offer_expiry_hours_on_expiry: "extend_once" };

  it("varsayılan eylem (expire): süresi dolan teklif kapanır, uzatılmaz", async () => {
    const h = makeHarness([offerRow()]);

    const result = await h.service.runHandleExpiredOffers();

    expect(h.rows[0].status).toBe(OfferStatus.expired);
    expect(h.rows[0].extendedAt).toBeNull();
    expect(h.notificationService.notifyOfferExpired).toHaveBeenCalledTimes(1);
    expect(h.notificationService.notifyOfferExtended).not.toHaveBeenCalled();
    expect(result.stats).toEqual({ expired: 1, extended: 0 });
  });

  it("extend_once: bir tam süre uzatır, hakkı kayda yazar, sıradaki tarafı bilgilendirir", async () => {
    const h = makeHarness([offerRow()], EXTEND);

    const result = await h.service.runHandleExpiredOffers();

    const row = h.rows[0];
    expect(row.status).toBe(OfferStatus.pending);
    expect(row.expiresAt).toEqual(new Date(T0.getTime() + 24 * HOUR));
    expect(row.extendedAt).toEqual(T0);
    expect(h.writes).toEqual(["offer-1:extend"]);
    expect(h.notificationService.notifyOfferExpired).not.toHaveBeenCalled();
    // Satıcı bekliyor (karşı teklif değil) → bildirim satıcıya.
    expect(h.notificationService.notifyOfferExtended).toHaveBeenCalledWith({
      recipientId: "seller-1",
      audience: "seller",
      offerId: "offer-1",
      productId: "product-1",
      productTitle: "Ürün",
      until: new Date(T0.getTime() + 24 * HOUR),
    });
    expect(result.stats).toEqual({ expired: 0, extended: 1 });
  });

  it("karşı tekliften sonra sıra alıcıdadır: bildirim alıcıya", async () => {
    const h = makeHarness([offerRow({ buyerMustAccept: true })], EXTEND);

    await h.service.runHandleExpiredOffers();

    expect(h.notificationService.notifyOfferExtended).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "buyer-1", audience: "buyer" }),
    );
  });

  it("bir kez uzatılır, ikinci dolumda expire olur", async () => {
    const h = makeHarness([offerRow()], EXTEND);

    await h.service.runHandleExpiredOffers();
    expect(h.rows[0].status).toBe(OfferStatus.pending);

    // Uzatılan sürenin içinde: dokunulmaz.
    jest.setSystemTime(new Date(T0.getTime() + 2 * HOUR));
    await h.service.runHandleExpiredOffers();
    expect(h.rows[0].status).toBe(OfferStatus.pending);

    // İkinci dolum: eylem hâlâ extend_once ama hak kullanıldı → expire.
    jest.setSystemTime(new Date(T0.getTime() + 25 * HOUR));
    const result = await h.service.runHandleExpiredOffers();

    expect(h.rows[0].status).toBe(OfferStatus.expired);
    expect(h.rows[0].extendedAt).toEqual(T0);
    expect(h.notificationService.notifyOfferExtended).toHaveBeenCalledTimes(1);
    expect(h.notificationService.notifyOfferExpired).toHaveBeenCalledTimes(1);
    expect(result.stats).toEqual({ expired: 1, extended: 0 });
  });

  it("ilan artık satışta değilse uzatılmaz, expire olur", async () => {
    const h = makeHarness(
      [
        offerRow({
          product: {
            title: "Ürün",
            status: ProductStatus.sold,
            quantity: null,
            reservedQuantity: 0,
          },
        }),
      ],
      EXTEND,
    );

    await h.service.runHandleExpiredOffers();

    expect(h.rows[0].status).toBe(OfferStatus.expired);
    expect(h.rows[0].extendedAt).toBeNull();
    expect(h.notificationService.notifyOfferExtended).not.toHaveBeenCalled();
  });

  it("müsait adet kalmadıysa uzatılmaz", async () => {
    const h = makeHarness(
      [
        offerRow({
          product: {
            title: "Ürün",
            status: ProductStatus.active,
            quantity: 1,
            reservedQuantity: 1,
          },
        }),
      ],
      EXTEND,
    );

    await h.service.runHandleExpiredOffers();

    expect(h.rows[0].status).toBe(OfferStatus.expired);
  });

  it.each([
    ["alıcı yasaklı", { buyer: { isBanned: true, deletedAt: null } }],
    ["satıcı yasaklı", { seller: { isBanned: true, deletedAt: null } }],
    ["satıcı silinmiş", { seller: { isBanned: false, deletedAt: T0 } }],
  ])("%s ise uzatılmaz, expire olur", async (_label, patch) => {
    const h = makeHarness([offerRow(patch)], EXTEND);

    await h.service.runHandleExpiredOffers();

    expect(h.rows[0].status).toBe(OfferStatus.expired);
    expect(h.rows[0].extendedAt).toBeNull();
    expect(h.notificationService.notifyOfferExtended).not.toHaveBeenCalled();
  });

  it("taraflar arasında engel varsa uzatılmaz, expire olur", async () => {
    const h = makeHarness([offerRow()], EXTEND, true);

    await h.service.runHandleExpiredOffers();

    expect(h.userBlocks.isBlockedEither).toHaveBeenCalledWith(
      "buyer-1",
      "seller-1",
    );
    expect(h.rows[0].status).toBe(OfferStatus.expired);
    expect(h.notificationService.notifyOfferExtended).not.toHaveBeenCalled();
  });

  it("eşzamanlı iki tur teklifi iki kez uzatmaz ve uzatılanı expire etmez", async () => {
    const h = makeHarness([offerRow()], EXTEND);

    await Promise.all([
      h.service.runHandleExpiredOffers(),
      h.service.runHandleExpiredOffers(),
    ]);

    expect(h.rows[0].status).toBe(OfferStatus.pending);
    // Tek başarılı yazım: bir uzatma — ikinci tur kaybetti, expire de etmedi.
    expect(h.writes).toEqual(["offer-1:extend"]);
    expect(h.rows[0].expiresAt).toEqual(new Date(T0.getTime() + 24 * HOUR));
    expect(h.notificationService.notifyOfferExtended).toHaveBeenCalledTimes(1);
    expect(h.notificationService.notifyOfferExpired).not.toHaveBeenCalled();
  });

  it("eşzamanlı iki tur (expire) teklifi iki kez bildirmez", async () => {
    const h = makeHarness([offerRow()]);

    await Promise.all([
      h.service.runHandleExpiredOffers(),
      h.service.runHandleExpiredOffers(),
    ]);

    expect(h.rows[0].status).toBe(OfferStatus.expired);
    expect(h.writes).toEqual(["offer-1:expire"]);
    expect(h.notificationService.notifyOfferExpired).toHaveBeenCalledTimes(1);
  });

  it("tur yeniden koşulursa (idempotent) uzatılmış teklife dokunmaz", async () => {
    const h = makeHarness([offerRow()], EXTEND);

    await h.service.runHandleExpiredOffers();
    await h.service.runHandleExpiredOffers();

    expect(h.writes).toEqual(["offer-1:extend"]);
    expect(h.notificationService.notifyOfferExtended).toHaveBeenCalledTimes(1);
  });

  it("eylem yolda değişir: karar süre dolduğu andaki eyleme göredir, damgalı süreler yeniden yazılmaz", async () => {
    const notDue = offerRow({
      id: "offer-2",
      expiresAt: new Date(T0.getTime() + 10 * HOUR),
    });
    const settings: Record<string, string> = { ...EXTEND };
    const h = makeHarness([offerRow(), notDue], settings);

    // Tur 1: extend_once → teklif-1 uzatıldı, teklif-2 (süresi dolmamış) aynen.
    await h.service.runHandleExpiredOffers();
    expect(h.rows[0].status).toBe(OfferStatus.pending);
    expect(h.rows[1].expiresAt).toEqual(new Date(T0.getTime() + 10 * HOUR));

    // Admin eylemi expire'a çevirir ve süreyi 12 saate indirir.
    settings.offer_expiry_hours_on_expiry = "expire";
    settings.offer_expiry_hours = "12";
    // Hiçbir bekleyen teklifin damgalı süresi geriye dönük değişmedi.
    expect(h.rows[0].expiresAt).toEqual(new Date(T0.getTime() + 24 * HOUR));

    // Teklif-2 dolar: ARTIK expire (hak hiç kullanılmamıştı ama eylem expire).
    jest.setSystemTime(new Date(T0.getTime() + 11 * HOUR));
    await h.service.runHandleExpiredOffers();
    expect(h.rows[1].status).toBe(OfferStatus.expired);
    expect(h.rows[1].extendedAt).toBeNull();
  });

  it("eylem expire iken extend_once'a çevrilirse sonraki dolum uzatılır; uzatma o andaki süre kadardır", async () => {
    const settings: Record<string, string> = {};
    const h = makeHarness(
      [
        offerRow({
          id: "late",
          expiresAt: new Date(T0.getTime() + 1 * HOUR),
        }),
      ],
      settings,
    );

    // Teklif hâlâ süresi dolmamış: tur dokunmaz.
    await h.service.runHandleExpiredOffers();
    expect(h.rows[0].status).toBe(OfferStatus.pending);

    // Admin dolumdan ÖNCE eylemi extend_once, süreyi 6 saat yapar.
    settings.offer_expiry_hours_on_expiry = "extend_once";
    settings.offer_expiry_hours = "6";
    jest.setSystemTime(new Date(T0.getTime() + 2 * HOUR));
    await h.service.runHandleExpiredOffers();

    expect(h.rows[0].status).toBe(OfferStatus.pending);
    expect(h.rows[0].expiresAt).toEqual(new Date(T0.getTime() + 8 * HOUR));
  });
});
