import { BadRequestException } from "@nestjs/common";
import { OfferService } from "./offer.service";
import {
  assertOfferAmountAboveFloor,
  offerPriceFloor,
} from "./helpers/offer-price-floor";
import { userBlockServiceStub } from "../user-block/user-block.testing";

/**
 * Teklif tutarı platform alt sınırının (`min_product_price`) altına inemez;
 * üst sınır teklife uygulanmaz. İlanın güncel fiyatı alt sınırın ALTINDAYSA
 * (geriye dönük işlemeyen eski ilan) taban yoktur: pazarlık eskisi gibi sürer.
 */
describe("offerPriceFloor", () => {
  it("ayar boşsa kural yoktur", () => {
    expect(offerPriceFloor(null, 1000)).toBeNull();
  });

  it("ilan fiyatı alt sınırın üstündeyse taban alt sınırdır", () => {
    expect(offerPriceFloor(250, 1000)).toBe(250);
  });

  it("ilan fiyatı tam alt sınırdaysa taban alt sınırdır", () => {
    expect(offerPriceFloor(250, 250)).toBe(250);
  });

  it("ilan fiyatı alt sınırın altındaysa (eski ilan) taban yoktur", () => {
    expect(offerPriceFloor(250, 200)).toBeNull();
  });
});

describe("assertOfferAmountAboveFloor", () => {
  const limits = { minPrice: 250, maxPrice: 300 };

  it("tabanın altını i18n mesajıyla reddeder", () => {
    try {
      assertOfferAmountAboveFloor(249, limits, 1000);
      throw new Error("beklenen hata atılmadı");
    } catch (error: any) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.response).toMatchObject({
        i18nKey: "server.offer.amountBelowMinimum",
        i18nParams: { minPrice: 250 },
      });
    }
  });

  it("tabana eşit tutarı kabul eder", () => {
    expect(() => assertOfferAmountAboveFloor(250, limits, 1000)).not.toThrow();
  });

  it("üst sınır teklife uygulanmaz", () => {
    expect(() => assertOfferAmountAboveFloor(900, limits, 1000)).not.toThrow();
  });

  it("eski ucuz ilanda (200 TL) taban uygulanmaz", () => {
    expect(() => assertOfferAmountAboveFloor(100, limits, 200)).not.toThrow();
    expect(() => assertOfferAmountAboveFloor(1, limits, 200)).not.toThrow();
  });

  it("ayar boşsa her tutar kabul edilir", () => {
    const none = { minPrice: null, maxPrice: null };
    expect(() => assertOfferAmountAboveFloor(1, none, 1000)).not.toThrow();
  });
});

describe("OfferService — teklif alt sınırı", () => {
  const STOP = new Error("stop");
  const product = (price: number) => ({
    id: "p1",
    sellerId: "s1",
    status: "active",
    quantity: 5,
    reservedQuantity: 0,
    price,
    oldPrice: null,
    seller: { id: "s1", displayName: "S" },
  });

  const build = ({
    min,
    listingPrice,
    offer = {},
  }: {
    min: string | undefined;
    listingPrice: number;
    offer?: Record<string, unknown>;
  }) => {
    const tx = {
      product: {
        findUnique: jest.fn().mockResolvedValue(product(listingPrice)),
      },
      offer: {
        // Alt sınırı GEÇEN teklif sonraki kapıda ("zaten bekleyen teklif")
        // durur: kabulün kanıtı, taban hatasının atılmamasıdır.
        findFirst: jest.fn().mockResolvedValue({ id: "existing" }),
        findUnique: jest.fn().mockResolvedValue({
          id: "o1",
          buyerId: "b1",
          sellerId: "s1",
          status: "pending",
          buyerMustAccept: false,
          amount: 100,
          expiresAt: new Date(Date.now() + 3_600_000),
          product: product(listingPrice),
          ...offer,
        }),
        // Taban geçilince geri kalan akış başlar: burada kesilir.
        update: jest.fn().mockRejectedValue(STOP),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: any) => fn(tx)),
      platformSetting: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(
            where.settingKey === "min_product_price" && min !== undefined
              ? { settingValue: min }
              : null,
          ),
        ),
      },
    };
    const service = new OfferService(
      prisma as any,
      { del: jest.fn(), delByPattern: jest.fn() } as any,
      { get: () => "24" } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined as any,
      {} as any,
      userBlockServiceStub() as any,
    );
    return { service, tx };
  };

  const floorError = (error: any) => ({
    i18nKey: error?.response?.i18nKey,
    minPrice: error?.response?.i18nParams?.minPrice,
  });

  describe("create (alıcı teklifi)", () => {
    it("alt sınırın altındaki teklifi reddeder", async () => {
      const { service, tx } = build({ min: "250", listingPrice: 1000 });

      const error = await service
        .create("b1", { productId: "p1", amount: 249 } as any)
        .catch((e) => e);

      expect(floorError(error)).toEqual({
        i18nKey: "server.offer.amountBelowMinimum",
        minPrice: 250,
      });
      expect(tx.offer.findFirst).not.toHaveBeenCalled();
    });

    it("alt sınıra eşit teklif taban kapısını geçer", async () => {
      const { service, tx } = build({ min: "250", listingPrice: 1000 });

      const error = await service
        .create("b1", { productId: "p1", amount: 500 } as any)
        .catch((e) => e);

      expect(error?.response?.i18nKey).toBe("server.offer.alreadyPendingOffer");
      expect(tx.offer.findFirst).toHaveBeenCalled();
    });

    it("sınırın altındaki eski ilanda (200 TL) taban uygulanmaz, pazarlık sürer", async () => {
      const { service } = build({ min: "250", listingPrice: 200 });

      const error = await service
        .create("b1", { productId: "p1", amount: 150 } as any)
        .catch((e) => e);

      expect(error?.response?.i18nKey).toBe("server.offer.alreadyPendingOffer");
    });

    it("ayar boşsa kural yoktur", async () => {
      const { service } = build({ min: undefined, listingPrice: 1000 });

      const error = await service
        .create("b1", { productId: "p1", amount: 600 } as any)
        .catch((e) => e);

      expect(error?.response?.i18nKey).toBe("server.offer.alreadyPendingOffer");
    });
  });

  describe("counter (satıcı karşı teklifi)", () => {
    it("alt sınırın altındaki karşı teklifi reddeder", async () => {
      const { service, tx } = build({
        min: "250",
        listingPrice: 1000,
        offer: { amount: 100 },
      });

      const error = await service
        .counter("o1", "s1", { amount: 200 } as any)
        .catch((e) => e);

      expect(floorError(error)).toEqual({
        i18nKey: "server.offer.amountBelowMinimum",
        minPrice: 250,
      });
      expect(tx.offer.update).not.toHaveBeenCalled();
    });

    it("alt sınır üstündeki karşı teklif kabul kapısını geçer", async () => {
      const { service, tx } = build({
        min: "250",
        listingPrice: 1000,
        offer: { amount: 100 },
      });

      const error = await service
        .counter("o1", "s1", { amount: 300 } as any)
        .catch((e) => e);

      expect(error).toBe(STOP);
      expect(tx.offer.update).toHaveBeenCalled();
    });
  });

  describe("sınırın altındaki eski ilan (taban yok)", () => {
    it("satıcı karşı teklifi taban olmadan kabul kapısını geçer", async () => {
      const { service } = build({
        min: "250",
        listingPrice: 200,
        offer: { amount: 100 },
      });

      const error = await service
        .counter("o1", "s1", { amount: 150 } as any)
        .catch((e) => e);

      expect(error).toBe(STOP);
    });

    it("alıcı karşı teklifi taban olmadan kabul kapısını geçer", async () => {
      const { service } = build({
        min: "250",
        listingPrice: 200,
        offer: { buyerMustAccept: true, amount: 180 },
      });

      const error = await service
        .buyerCounter("o1", "b1", { amount: 120 } as any)
        .catch((e) => e);

      expect(error).toBe(STOP);
    });
  });

  describe("buyerCounter (alıcı karşı teklifi)", () => {
    const offer = { buyerMustAccept: true, amount: 900 };

    it("alt sınırın altındaki karşı teklifi reddeder", async () => {
      const { service, tx } = build({ min: "600", listingPrice: 1000, offer });

      const error = await service
        .buyerCounter("o1", "b1", { amount: 550 } as any)
        .catch((e) => e);

      expect(floorError(error)).toEqual({
        i18nKey: "server.offer.amountBelowMinimum",
        minPrice: 600,
      });
      expect(tx.offer.update).not.toHaveBeenCalled();
    });

    it("alt sınır üstündeki karşı teklif kabul kapısını geçer", async () => {
      const { service, tx } = build({ min: "600", listingPrice: 1000, offer });

      const error = await service
        .buyerCounter("o1", "b1", { amount: 700 } as any)
        .catch((e) => e);

      expect(error).toBe(STOP);
      expect(tx.offer.update).toHaveBeenCalled();
    });
  });

  /**
   * The upper bound mirrors web (`offerSchema`) and mobile (`MakeOfferModal`):
   * an offer is strictly below the price they show, which is the API's
   * `price` (`resolveSalePrice`). The seller counter may reach the price.
   */
  describe("listing price ceiling", () => {
    const i18nKeyOf = (error: unknown) =>
      (error as { response?: { i18nKey?: string } } | undefined)?.response
        ?.i18nKey;

    it.each([1000, 1000.01, 5000])(
      "create refuses an offer of %p on a 1000 TL listing",
      async (amount) => {
        const { service, tx } = build({ min: undefined, listingPrice: 1000 });

        const error = await service
          .create("b1", { productId: "p1", amount })
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect(i18nKeyOf(error)).toBe("server.offer.offerMustBeBelowPrice");
        expect(tx.offer.findFirst).not.toHaveBeenCalled();
      },
    );

    it("create accepts 999.99 on a 1000 TL listing", async () => {
      const { service } = build({ min: undefined, listingPrice: 1000 });

      const error = await service
        .create("b1", { productId: "p1", amount: 999.99 })
        .catch((e: unknown) => e);

      expect(i18nKeyOf(error)).toBe("server.offer.alreadyPendingOffer");
    });

    it("create bounds by the sale price after the discount window closed", async () => {
      // price 800 with oldPrice 1000 and a window that ended: the listing
      // sells (and shows) at 1000, so 900 is a valid offer.
      const { service, tx } = build({ min: undefined, listingPrice: 800 });
      tx.product.findUnique.mockResolvedValue({
        ...product(800),
        oldPrice: 1000,
        saleEndDate: new Date(Date.now() - 3_600_000),
      });

      const error = await service
        .create("b1", { productId: "p1", amount: 900 })
        .catch((e: unknown) => e);

      expect(i18nKeyOf(error)).toBe("server.offer.alreadyPendingOffer");
    });

    it("the seller counter may equal the listing price", async () => {
      const { service, tx } = build({
        min: undefined,
        listingPrice: 1000,
        offer: { amount: 600 },
      });

      const error = await service
        .counter("o1", "s1", { amount: 1000 })
        .catch((e: unknown) => e);

      expect(error).toBe(STOP);
      expect(tx.offer.update).toHaveBeenCalled();
    });

    it("the seller counter above the listing price is refused", async () => {
      const { service } = build({
        min: undefined,
        listingPrice: 1000,
        offer: { amount: 600 },
      });

      const error = await service
        .counter("o1", "s1", { amount: 1000.01 })
        .catch((e: unknown) => e);

      expect(i18nKeyOf(error)).toBe("server.offer.counterCannotExceedPrice");
    });
  });
});
