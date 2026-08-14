import { DiscountScope, DiscountTarget, DiscountType } from "@prisma/client";
import { DiscountService } from "./discount.service";

/**
 * Adet koşullu satıcı kampanyalarının servis katmanı: tek sorguyla çözüm,
 * satıcı-sınırı (cep kuralı) ve tanım doğrulaması (Ç1/Ç2 kararları).
 */
describe("DiscountService quantity campaigns", () => {
  const bogoCampaign = {
    id: "bogo-1",
    name: "2 Al 1 Öde",
    type: DiscountType.bogo,
    value: 0,
    scope: DiscountScope.seller,
    sellerId: "seller-1",
    categoryId: null,
    targetProductIds: [],
    target: DiscountTarget.product_price,
    buyQuantity: 1,
    getQuantity: 1,
    minQuantity: null,
    maxDiscountAmount: null,
  };

  function makeService(campaigns: unknown[]) {
    const prisma = {
      discount: {
        findMany: jest.fn().mockResolvedValue(campaigns),
      },
    } as any;
    return new DiscountService(
      prisma,
      { delPattern: jest.fn() } as any,
      { syncProduct: jest.fn() } as any,
    );
  }

  it("satır adedi koşulu sağlayan ürüne kampanyayı uygular", async () => {
    const service = makeService([bogoCampaign]);
    const result = await service.quantityDiscountsForLines([
      {
        productId: "p1",
        sellerId: "seller-1",
        categoryId: "c1",
        unitPrice: 100,
        quantity: 2,
      },
    ]);
    expect(result.get("p1")).toEqual({
      discountId: "bogo-1",
      name: "2 Al 1 Öde",
      amount: 100,
    });
  });

  it("başka satıcının ürününe uygulamaz (cep kuralı)", async () => {
    const service = makeService([bogoCampaign]);
    const result = await service.quantityDiscountsForLines([
      {
        productId: "p2",
        sellerId: "seller-2",
        categoryId: "c1",
        unitPrice: 100,
        quantity: 2,
      },
    ]);
    expect(result.size).toBe(0);
  });

  it("tek adetlik sepette sorgu bile atılmaz", async () => {
    const prisma = {
      discount: { findMany: jest.fn() },
    } as any;
    const service = new DiscountService(
      prisma,
      { delPattern: jest.fn() } as any,
      { syncProduct: jest.fn() } as any,
    );
    const result = await service.quantityDiscountsForLines([
      {
        productId: "p1",
        sellerId: "seller-1",
        categoryId: "c1",
        unitPrice: 100,
        quantity: 1,
      },
    ]);
    expect(result.size).toBe(0);
    expect(prisma.discount.findMany).not.toHaveBeenCalled();
  });

  describe("tanım doğrulaması", () => {
    const base = {
      name: "Kampanya",
      scope: "seller",
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 86400000).toISOString(),
    };
    const service = makeService([]);

    it("bogo için buy/get zorunludur", async () => {
      await expect(
        service.create(
          { ...base, type: DiscountType.bogo, value: 0 } as any,
          "seller-1",
          false,
        ),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.discount.buyXGetYMinimum" },
      });
    });

    it("bulk_quantity için minQuantity en az 2 olmalıdır", async () => {
      await expect(
        service.create(
          {
            ...base,
            type: DiscountType.bulk_quantity,
            value: 10,
            minQuantity: 1,
          } as any,
          "seller-1",
          false,
        ),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.discount.minQuantityAtLeastTwo" },
      });
    });

    it("adet koşullu kampanya bedel kalemine tanımlanamaz", async () => {
      await expect(
        service.create(
          {
            ...base,
            type: DiscountType.bulk_quantity,
            value: 10,
            minQuantity: 3,
            target: DiscountTarget.buyer_commission,
            budgetLimit: 100,
          } as any,
          null,
          true,
        ),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.discount.quantityCampaignProductOnly" },
      });
    });
  });
});
