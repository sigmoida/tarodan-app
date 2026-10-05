import { BadRequestException } from "@nestjs/common";
import { ListingRemovalReason, ProductStatus } from "@prisma/client";
import { ProductUpdateService } from "./product-update.service";

/**
 * Satıcının silmesi ve pasife alması NEDEN kaydeder (opsiyonel gövde): neden
 * gönderilmezse (yayındaki mobil sürümler) işlem yine yapılır ve `not_given`
 * kaydedilir; geçersiz neden hiçbir şey yazdırmaz. Düzenlemeyle stoğun 0'a
 * çekilmesi "stok tükendi"dir. Kayıt statü yazımıyla aynı transaction'dadır.
 */
describe("ProductUpdateService — kaldırma nedeni", () => {
  const SELLER = "seller-1";
  const PRODUCT = "product-1";

  const makeService = (productPatch: Record<string, unknown> = {}) => {
    const tx = {
      product: {
        update: jest.fn().mockResolvedValue({
          id: PRODUCT,
          sellerId: SELLER,
          status: ProductStatus.inactive,
          images: [],
          productAttributes: [],
          quantity: 1,
          reservedQuantity: 0,
          title: "Hot Wheels",
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productRemovalEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      productImage: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: PRODUCT,
          sellerId: SELLER,
          version: 2,
          price: 100,
          oldPrice: null,
          categoryId: "cat-1",
          brandId: "brand-1",
          carModelId: null,
          manufacturerId: "man-1",
          status: ProductStatus.active,
          quantity: 1,
          reservedQuantity: 0,
          images: [],
          ...productPatch,
        }),
      },
      $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
      user: {
        findUnique: jest.fn().mockResolvedValue({
          isBanned: false,
          businessStatus: null,
          companyName: null,
          taxId: null,
          membership: null,
        }),
      },
      offer: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
    };
    const service = new ProductUpdateService(
      prisma as any,
      { del: jest.fn(), delPattern: jest.fn() } as any, // cache
      { syncProduct: jest.fn().mockResolvedValue(undefined) } as any, // search
      {} as any, // notification
      {} as any, // smtp
      { formatProductResponse: jest.fn().mockResolvedValue({}) } as any,
      {
        recomputeProductRanking: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any, // membershipService
      { assertListingRuleExists: jest.fn() } as any,
      { assertTextClean: jest.fn(), isEnabled: false } as any,
    );
    return { service, prisma, tx };
  };

  describe("silme (DELETE /products/:id)", () => {
    it("seçilen nedeni, platformu ve notu statüyle aynı transaction'da kaydeder", async () => {
      const { service, tx } = makeService();

      await service.remove(PRODUCT, SELLER, {
        removalReason: "sold_elsewhere",
        removalPlatform: "instagram",
        removalDetail: "DM'den sattım",
      });

      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT },
        data: { status: ProductStatus.deleted },
      });
      expect(tx.productRemovalEvent.createMany).toHaveBeenCalledWith({
        data: [
          {
            productId: PRODUCT,
            reason: ListingRemovalReason.sold_elsewhere,
            platform: "instagram",
            violationCode: null,
            detail: "DM'den sattım",
            statusBefore: ProductStatus.active,
            statusAfter: ProductStatus.deleted,
            actorUserId: SELLER,
          },
        ],
      });
      expect(tx.product.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [PRODUCT] }, status: ProductStatus.deleted },
        data: { removalReason: ListingRemovalReason.sold_elsewhere },
      });
    });

    it("eski istemci (gövdesiz silme) kabul edilir ve 'not_given' kaydedilir", async () => {
      const { service, tx } = makeService();

      await service.remove(PRODUCT, SELLER);

      expect(tx.product.update).toHaveBeenCalled();
      expect(
        tx.productRemovalEvent.createMany.mock.calls[0][0].data[0],
      ).toEqual(
        expect.objectContaining({
          reason: ListingRemovalReason.not_given,
          platform: null,
          detail: null,
        }),
      );
    });

    it("pasif ilanın silinmesi de bir kaldırmadır (inactive → deleted)", async () => {
      const { service, tx } = makeService({ status: ProductStatus.inactive });

      await service.remove(PRODUCT, SELLER, { removalReason: "changed_mind" });

      expect(
        tx.productRemovalEvent.createMany.mock.calls[0][0].data[0],
      ).toEqual(
        expect.objectContaining({
          reason: ListingRemovalReason.changed_mind,
          statusBefore: ProductStatus.inactive,
          statusAfter: ProductStatus.deleted,
        }),
      );
    });

    it("geçersiz neden 400 döner ve HİÇBİR şey yazmaz", async () => {
      const { service, prisma, tx } = makeService();

      await expect(
        service.remove(PRODUCT, SELLER, {
          removalReason: "paused_temporarily", // yalnız pasife almada
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.product.update).not.toHaveBeenCalled();
    });
  });

  describe("pasife alma (PATCH status=inactive)", () => {
    it("satıcının seçtiği nedeni kaydeder (geçici duraklatma)", async () => {
      const { service, tx } = makeService();

      await service.update(PRODUCT, SELLER, {
        status: ProductStatus.inactive,
        removalReason: "paused_temporarily",
        removalDetail: "Tatile çıkıyorum",
      } as any);

      expect(tx.product.update.mock.calls[0][0].data.status).toBe(
        ProductStatus.inactive,
      );
      expect(tx.productRemovalEvent.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            productId: PRODUCT,
            reason: ListingRemovalReason.paused_temporarily,
            detail: "Tatile çıkıyorum",
            statusBefore: ProductStatus.active,
            statusAfter: ProductStatus.inactive,
            actorUserId: SELLER,
          }),
        ],
      });
    });

    it("eski istemci (nedensiz pasife alma) kabul edilir ve 'not_given' kaydedilir", async () => {
      const { service, tx } = makeService();

      await service.update(PRODUCT, SELLER, {
        status: ProductStatus.inactive,
      } as any);

      expect(
        tx.productRemovalEvent.createMany.mock.calls[0][0].data[0].reason,
      ).toBe(ListingRemovalReason.not_given);
    });

    it("platformsuz 'başka platformda sattım' 400 döner, ilan yazılmaz", async () => {
      const { service, prisma } = makeService();

      await expect(
        service.update(PRODUCT, SELLER, {
          status: ProductStatus.inactive,
          removalReason: "sold_elsewhere",
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("stoğun 0'a çekilmesi (statü istenmeden) 'stok tükendi' kaydeder", async () => {
      const { service, tx } = makeService();

      await service.update(PRODUCT, SELLER, { quantity: 0 } as any);

      expect(
        tx.productRemovalEvent.createMany.mock.calls[0][0].data[0],
      ).toEqual(
        expect.objectContaining({
          reason: ListingRemovalReason.out_of_stock,
          actorUserId: SELLER,
        }),
      );
    });

    it("yönetici düzenlemesiyle stok 0: 'stok tükendi', işlemi yapan yönetici", async () => {
      const { service, tx } = makeService();

      await service.updateAsAdmin(PRODUCT, "admin-1", { quantity: 0 } as any);

      expect(
        tx.productRemovalEvent.createMany.mock.calls[0][0].data[0],
      ).toEqual(
        expect.objectContaining({
          reason: ListingRemovalReason.out_of_stock,
          actorUserId: "admin-1",
        }),
      );
    });

    it("vitrinde kalan düzenleme (ör. model kodu) kaldırma kaydı üretmez", async () => {
      const { service, tx } = makeService();

      await service.update(PRODUCT, SELLER, { modelCode: "HW-01" } as any);

      expect(tx.productRemovalEvent.createMany).not.toHaveBeenCalled();
    });

    it("zaten pasif ilanın yeniden kaydedilmesi (tekrar pasife alma) ikinci kayıt üretmez", async () => {
      // Pasif ilan düzenleme gövdesine hiç ulaşmaz: yeniden satışa açma
      // dışındaki her istek `setQuantityToReopen` ile yazımdan önce reddedilir.
      const { service, prisma, tx } = makeService({
        status: ProductStatus.inactive,
      });

      await expect(
        service.update(PRODUCT, SELLER, {
          status: ProductStatus.inactive,
          removalReason: "changed_mind",
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.productRemovalEvent.createMany).not.toHaveBeenCalled();
    });
  });
});
