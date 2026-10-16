import { BadRequestException } from "@nestjs/common";
import { ProductUpdateService } from "./product-update.service";

/**
 * Düzenlemede platform fiyat sınırı (min_product_price / max_product_price).
 *
 * Sınır geriye dönük işlemez: sınırın altında kalmış mevcut ilan yayında kalır
 * ve fiyatına dokunmadan düzenlenebilir. Sınır yalnız fiyat/indirimli fiyat
 * gerçekten DEĞİŞTİĞİNDE (ya da yeni indirim girildiğinde) uygulanır; ayar
 * boşsa kural yoktur.
 */
describe("ProductUpdateService — düzenlemede fiyat sınırı", () => {
  const sellerId = "seller-1";
  const productId = "product-1";

  const makeService = ({
    product,
    limits,
  }: {
    product: Record<string, unknown>;
    limits: Record<string, string | undefined>;
  }) => {
    const updatedRow = {
      id: productId,
      sellerId,
      images: [],
      productAttributes: [],
    };
    const tx = {
      productImage: { deleteMany: jest.fn(), createMany: jest.fn() },
      product: {
        update: jest.fn().mockResolvedValue(updatedRow),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productRemovalEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      product: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: productId,
            sellerId,
            version: 1,
            price: 100,
            oldPrice: null,
            originalPrice: null,
            salePrice: null,
            categoryId: "cat-1",
            brandId: "brand-1",
            carModelId: null,
            manufacturerId: "manufacturer-1",
            status: "active",
            quantity: 1,
            reservedQuantity: 0,
            images: [],
            ...product,
          })
          .mockResolvedValue(updatedRow),
      },
      platformSetting: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(
            limits[where.settingKey] === undefined
              ? null
              : { settingValue: limits[where.settingKey] },
          ),
        ),
      },
      $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isBanned: false, bannedUntil: null }),
      },
    };
    const service = new ProductUpdateService(
      prisma as any,
      { del: jest.fn(), delPattern: jest.fn() } as any,
      { syncProduct: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      {} as any,
      { formatProductResponse: jest.fn().mockResolvedValue({}) } as any,
      {
        recomputeProductRanking: jest.fn().mockResolvedValue(undefined),
      } as any,
      {
        getUserLimits: jest
          .fn()
          .mockResolvedValue({ maxImages: 3, tierName: "Ücretsiz" }),
      } as any,
      { assertListingRuleExists: jest.fn() } as any,
      { assertTextClean: jest.fn(), isEnabled: false } as any,
    );
    return { service, prisma, tx };
  };

  const update = (
    service: ProductUpdateService,
    dto: Record<string, unknown>,
  ) => service.update(productId, sellerId, dto as any);

  const expectBelowMinimum = async (promise: Promise<unknown>) => {
    const error: any = await promise.catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.response).toMatchObject({
      i18nKey: "server.product.priceBelowMinimum",
      i18nParams: { minPrice: 250 },
    });
  };

  describe("sınırın altındaki mevcut ilan (200 TL, alt sınır 250)", () => {
    const grandfathered = { price: 200 };
    const limits = { min_product_price: "250" };

    it("fiyatı DEĞİŞMEDEN düzenlenebilir (sınır sorgulanmaz bile)", async () => {
      const { service, prisma, tx } = makeService({
        product: grandfathered,
        limits,
      });

      await update(service, { title: "Yeni başlık", price: 200 });

      expect(prisma.platformSetting.findUnique).not.toHaveBeenCalled();
      expect(tx.product.update).toHaveBeenCalled();
    });

    it("fiyat gönderilmeden düzenlenebilir", async () => {
      const { service, tx } = makeService({ product: grandfathered, limits });

      await update(service, { title: "Yeni başlık" });

      expect(tx.product.update).toHaveBeenCalled();
    });

    it("fiyat sınırın altında BAŞKA bir değere çekilirse reddedilir", async () => {
      const { service, tx } = makeService({ product: grandfathered, limits });

      await expectBelowMinimum(update(service, { price: 220 }));
      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it("admin düzenlemesi sınırdan muaf (sınır altı yeni fiyat kabul edilir)", async () => {
      const { service, prisma, tx } = makeService({
        product: grandfathered,
        limits,
      });

      await service.updateAsAdmin(productId, "admin-1", { price: 220 } as any);

      expect(prisma.platformSetting.findUnique).not.toHaveBeenCalled();
      expect(tx.product.update).toHaveBeenCalled();
    });

    it("fiyat sınırın üstüne çıkarılabilir", async () => {
      const { service, tx } = makeService({ product: grandfathered, limits });

      await update(service, { price: 300 });

      expect(tx.product.update).toHaveBeenCalled();
    });

    it("yeni girilen indirimli fiyat sınırın altındaysa reddedilir", async () => {
      const { service } = makeService({
        product: { price: 400 },
        limits,
      });

      await expectBelowMinimum(
        update(service, { price: 400, originalPrice: 400, salePrice: 240 }),
      );
    });

    it("yeni indirimli fiyat sınırın üstündeyse kabul edilir", async () => {
      const { service, tx } = makeService({
        product: { price: 400 },
        limits,
      });

      await update(service, { price: 400, originalPrice: 400, salePrice: 260 });

      expect(tx.product.update).toHaveBeenCalled();
    });
  });

  describe("sınırın altında indirimli mevcut ilan (liste 400, indirimli 200)", () => {
    const onSale = {
      price: 200,
      oldPrice: 400,
      originalPrice: 400,
      salePrice: 200,
    };
    const limits = { min_product_price: "250" };

    it("form kayıtlı fiyatları olduğu gibi geri gönderince kabul edilir", async () => {
      const { service, prisma, tx } = makeService({ product: onSale, limits });

      await update(service, {
        title: "Yeni başlık",
        price: 400,
        originalPrice: 400,
        salePrice: 200,
      });

      expect(prisma.platformSetting.findUnique).not.toHaveBeenCalled();
      expect(tx.product.update).toHaveBeenCalled();
    });

    it("indirimli fiyat başka bir alt-sınır değerine değiştirilirse reddedilir", async () => {
      const { service } = makeService({ product: onSale, limits });

      await expectBelowMinimum(
        update(service, { price: 400, originalPrice: 400, salePrice: 210 }),
      );
    });
  });

  describe("üst sınır", () => {
    it("değişen fiyat üst sınırı aşarsa reddedilir", async () => {
      const { service } = makeService({
        product: { price: 100 },
        limits: { max_product_price: "5000" },
      });

      const error: any = await update(service, { price: 6000 }).catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.response).toMatchObject({
        i18nKey: "server.product.priceAboveMaximum",
        i18nParams: { maxPrice: 5000 },
      });
    });
  });

  describe("ayar boş / yok", () => {
    it.each([undefined, "", "  "])(
      "alt sınır %j iken her fiyat kabul edilir",
      async (value) => {
        const { service, tx } = makeService({
          product: { price: 100 },
          limits: { min_product_price: value, max_product_price: value },
        });

        await update(service, { price: 1 });

        expect(tx.product.update).toHaveBeenCalled();
      },
    );
  });
});
