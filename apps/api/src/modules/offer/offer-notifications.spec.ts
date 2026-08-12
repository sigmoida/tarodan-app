import { BadRequestException } from "@nestjs/common";
import { OfferStatus, ProductStatus } from "@prisma/client";
import { OfferService } from "./offer.service";
import { OfferSchedulerService } from "./offer-scheduler.service";

/**
 * Teklif sürecinin sessiz kalan üç noktası:
 *
 *  1. `notifyOfferAccepted` tanımlıydı ama HİÇ çağrılmıyordu: alıcı 24 saatlik
 *     ödeme penceresini zilde göremiyordu. Karşı teklifi alıcı kabul ettiğinde
 *     satıcıya da hiçbir şey gitmiyordu.
 *  2. Süre dolumu cron'u teklifleri sessizce `expired` yapıyordu; OFFER_EXPIRED
 *     tipi kullanılmıyordu.
 *  3. %50 tabanı ham `product.price` üzerinden hesaplanıyordu; indirim penceresi
 *     kapandığında ürün `oldPrice`tan satıldığı için taban gerçek fiyatın çok
 *     altında kalıyordu (checkout ile teklif ekranı farklı fiyat görüyordu).
 */
describe("Teklif — bildirimler ve fiyat tabanı", () => {
  const product = {
    id: "product-1",
    title: "Ürün",
    sellerId: "seller-1",
    categoryId: "cat-1",
    status: ProductStatus.active,
    shippingDesi: 2,
    price: 1000,
    // İndirim penceresi KAPALI: geçerli satış fiyatı 2000 (oldPrice).
    oldPrice: 2000,
    saleStartDate: new Date("2020-01-01"),
    saleEndDate: new Date("2020-02-01"),
    images: [],
    seller: { id: "seller-1", email: "s@x.com" },
  };

  const offer = {
    id: "offer-1",
    status: OfferStatus.pending,
    amount: 1000,
    buyerId: "buyer-1",
    sellerId: "seller-1",
    productId: "product-1",
    buyerMustAccept: false,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    product: { ...product, price: 1200, oldPrice: null },
    buyer: { id: "buyer-1", email: "b@x.com" },
    seller: { id: "seller-1", email: "s@x.com" },
  };

  const makeService = (overrides: { buyerMustAccept?: boolean } = {}) => {
    const offerRow = {
      ...offer,
      buyerMustAccept: overrides.buyerMustAccept ?? false,
    };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "offer-1" }]),
      offer: {
        findUnique: jest.fn().mockResolvedValue({ ...offerRow, order: null }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ ...offerRow }),
        create: jest.fn().mockResolvedValue({ ...offerRow }),
      },
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      order: {
        create: jest
          .fn()
          .mockImplementation((arg: any) =>
            Promise.resolve({ id: "order-1", ...arg.data }),
          ),
      },
    };
    const notificationService = {
      notifyOfferAccepted: jest.fn().mockResolvedValue(undefined),
      notifyOfferCounterAccepted: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OfferService(
      {
        $transaction: jest.fn().mockImplementation((fn: any) => fn(tx)),
        order: { count: jest.fn().mockResolvedValue(0) },
      } as any,
      { del: jest.fn(), delByPattern: jest.fn() } as any,
      { get: () => undefined } as any,
      { emitOfferAccepted: jest.fn(), emitOfferCreated: jest.fn() } as any,
      notificationService as any,
      {} as any,
      {
        checkAndReserve: jest.fn(),
        lockProductForUpdate: jest.fn().mockResolvedValue(product),
      } as any,
      undefined as any,
      {
        resolveOfferOrderPricing: jest.fn().mockResolvedValue({
          commission: {},
          buyerShippingAmount: 0,
          sellerShippingAmount: 0,
          taxAmount: 0,
          withholdingTaxAmount: 0,
          buyerServiceTaxAmount: 0,
          sellerServiceTaxAmount: 0,
          serviceVatRate: 0,
          totalAmount: 1000,
        }),
      } as any,
    );
    return { service, notificationService, tx };
  };

  it("kabulde alıcıya ödeme penceresi bildirimi gider (sipariş bağlı)", async () => {
    const { service, notificationService } = makeService();

    await service.accept("offer-1", "seller-1");

    expect(notificationService.notifyOfferAccepted).toHaveBeenCalledWith(
      "buyer-1",
      "product-1",
      1000,
      "order-1",
      expect.any(String),
    );
    expect(
      notificationService.notifyOfferCounterAccepted,
    ).not.toHaveBeenCalled();
  });

  it("karşı teklifi alıcı kabul ederse satıcı da haberdar edilir", async () => {
    const { service, notificationService } = makeService({
      buyerMustAccept: true,
    });

    await service.accept("offer-1", "buyer-1");

    expect(notificationService.notifyOfferCounterAccepted).toHaveBeenCalledWith(
      "seller-1",
      "product-1",
      1000,
      "order-1",
      expect.any(String),
    );
  });

  it("%50 tabanı indirim penceresi kapalıyken gerçek satış fiyatından hesaplanır", async () => {
    const { service } = makeService();

    // Pencere kapalı → geçerli fiyat 2000, taban 1000. 900 reddedilmeli
    // (ham `price`=1000 ile taban 500 olsaydı geçerdi).
    await expect(
      service.create("buyer-1", { productId: "product-1", amount: 900 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("OfferSchedulerService — süre dolumu bildirimi", () => {
  it("süresi dolan teklifi iki tarafa da duyurur", async () => {
    const expiring = [
      {
        id: "offer-1",
        buyerId: "buyer-1",
        sellerId: "seller-1",
        productId: "product-1",
        product: { title: "Ürün" },
      },
    ];
    const prisma = {
      offer: {
        findMany: jest.fn().mockResolvedValue(expiring),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const notificationService = {
      notifyOfferExpired: jest.fn().mockResolvedValue(undefined),
    };
    const service = new OfferSchedulerService(
      prisma as any,
      {} as any,
      notificationService as any,
    );

    await service.runHandleExpiredOffers();

    expect(notificationService.notifyOfferExpired).toHaveBeenCalledWith({
      buyerId: "buyer-1",
      sellerId: "seller-1",
      productId: "product-1",
      productTitle: "Ürün",
    });
  });

  it("süresi dolan teklif yoksa bildirim gönderilmez", async () => {
    const prisma = {
      offer: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const notificationService = { notifyOfferExpired: jest.fn() };
    const service = new OfferSchedulerService(
      prisma as any,
      {} as any,
      notificationService as any,
    );

    await service.runHandleExpiredOffers();

    expect(notificationService.notifyOfferExpired).not.toHaveBeenCalled();
  });
});
