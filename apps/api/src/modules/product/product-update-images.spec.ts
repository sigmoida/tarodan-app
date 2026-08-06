import { BadRequestException } from "@nestjs/common";
import { ProductUpdateService } from "./product-update.service";
import { productImageFolder } from "./helpers/product-image-keys";

/**
 * Düzenlemede görsel yazımı ürün güncellemesiyle AYNI transaction'da olmalı.
 *
 * Regresyon: görseller ÖNCE silinip yeniden oluşturuluyor, iyimser kilit
 * (`version`) kontrolü SONRA yapılıyordu. İki sekmede aynı ilan düzenlendiğinde
 * ikinci kaydetme sürüm çakışmasıyla düşüyor ama görseller çoktan silinmiş
 * oluyordu: ürün değişmemiş, görselleri gitmiş bir ilan kalıyordu.
 */
describe("ProductUpdateService — görsel güncellemesi", () => {
  const sellerId = "seller-1";
  const productId = "product-1";
  const key = (name: string) =>
    `dev/products/${productImageFolder(sellerId)}/${name}.webp`;

  const existingImages = [
    {
      cardKey: "dev/products/product-images/temp/old-card.webp",
      detailKey: "dev/products/product-images/temp/old-detail.webp",
    },
  ];

  const makeService = ({
    updateThrows = false,
  }: { updateThrows?: boolean } = {}) => {
    const tx = {
      productImage: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      product: {
        update: updateThrows
          ? jest
              .fn()
              .mockRejectedValue(
                Object.assign(new Error("record not found"), { code: "P2025" }),
              )
          : jest.fn().mockResolvedValue({
              id: productId,
              sellerId,
              images: [],
              productAttributes: [],
            }),
      },
    };

    let rolledBack = false;
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue({
          id: productId,
          sellerId,
          version: 3,
          price: 100,
          oldPrice: null,
          categoryId: "cat-1",
          status: "active",
          images: existingImages,
        }),
      },
      // Transaction gerçek gibi davranır: geri sarıldığında içindeki yazmalar
      // "olmamış" sayılır (testte bayrakla temsil edilir).
      $transaction: jest.fn(async (fn: (client: unknown) => unknown) => {
        try {
          return await fn(tx);
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      }),
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isBanned: false, bannedUntil: null }),
      },
      attribute: { findMany: jest.fn().mockResolvedValue([]) },
      productAttribute: { deleteMany: jest.fn(), createMany: jest.fn() },
      productImage: { deleteMany: jest.fn(), createMany: jest.fn() },
    };

    const membershipService = {
      getUserLimits: jest
        .fn()
        .mockResolvedValue({ maxImages: 3, tierName: "Ücretsiz" }),
    };

    const service = new ProductUpdateService(
      prisma as any,
      { delPattern: jest.fn() } as any, // cache
      { syncProduct: jest.fn() } as any, // search
      {} as any, // notification
      {} as any, // smtp
      { formatProductResponse: jest.fn().mockResolvedValue({}) } as any, // common
      { recompute: jest.fn() } as any, // ranking
      membershipService as any,
      { assertListingRuleExists: jest.fn() } as any,
    );

    return { service, prisma, tx, wasRolledBack: () => rolledBack };
  };

  const dtoWith = (images: Array<{ cardKey: string; detailKey: string }>) => ({
    images,
  });

  it("görselleri ürün güncellemesiyle AYNI transaction içinde yazar", async () => {
    const { service, tx } = makeService();

    await service
      .update(
        productId,
        sellerId,
        dtoWith([
          { cardKey: key("a-card"), detailKey: key("a-detail") },
        ]) as any,
      )
      .catch(() => undefined);

    // Silme, oluşturma ve ürün güncellemesi aynı tx istemcisinden çağrılır.
    expect(tx.productImage.deleteMany).toHaveBeenCalled();
    expect(tx.productImage.createMany).toHaveBeenCalled();
    expect(tx.product.update).toHaveBeenCalled();
  });

  it("sıra AUTHORITATIVE: sortOrder gönderilen dizinin indeksidir", async () => {
    const { service, tx } = makeService();

    await service
      .update(
        productId,
        sellerId,
        dtoWith([
          { cardKey: key("b-card"), detailKey: key("b-detail") },
          { cardKey: key("a-card"), detailKey: key("a-detail") },
        ]) as any,
      )
      .catch(() => undefined);

    expect(tx.productImage.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ cardKey: key("b-card"), sortOrder: 0 }),
        expect.objectContaining({ cardKey: key("a-card"), sortOrder: 1 }),
      ],
    });
  });

  it("iyimser kilit hatasında transaction geri sarılır (görseller durur)", async () => {
    const { service, wasRolledBack } = makeService({ updateThrows: true });

    await service
      .update(
        productId,
        sellerId,
        dtoWith([
          { cardKey: key("a-card"), detailKey: key("a-detail") },
        ]) as any,
      )
      .catch(() => undefined);

    expect(wasRolledBack()).toBe(true);
  });

  describe("doğrulama create ile aynı", () => {
    it("üyelik adet sınırını aşan istek reddedilir", async () => {
      const { service, tx } = makeService();

      await expect(
        service.update(
          productId,
          sellerId,
          dtoWith(
            Array.from({ length: 4 }, (_, i) => ({
              cardKey: key(`${i}-card`),
              detailKey: key(`${i}-detail`),
            })),
          ) as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Reddedilen istek hiçbir görseli silmemeli.
      expect(tx.productImage.deleteMany).not.toHaveBeenCalled();
    });

    it("başkasının yüklemesi reddedilir", async () => {
      const { service } = makeService();

      await expect(
        service.update(
          productId,
          sellerId,
          dtoWith([
            {
              cardKey: `dev/products/${productImageFolder("someone-else")}/x-card.webp`,
              detailKey: `dev/products/${productImageFolder("someone-else")}/x-detail.webp`,
            },
          ]) as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("ürüne HÂLEN bağlı eski anahtarlar kabul edilir", async () => {
      const { service, tx } = makeService();

      await service
        .update(productId, sellerId, dtoWith(existingImages) as any)
        .catch(() => undefined);

      expect(tx.productImage.createMany).toHaveBeenCalled();
    });

    it("aynı anahtar iki kez gönderilirse reddedilir", async () => {
      const { service } = makeService();
      const duplicate = {
        cardKey: key("a-card"),
        detailKey: key("a-detail"),
      };

      await expect(
        service.update(
          productId,
          sellerId,
          dtoWith([duplicate, { ...duplicate }]) as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
