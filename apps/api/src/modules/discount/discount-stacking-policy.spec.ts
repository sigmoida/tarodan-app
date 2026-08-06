import { DiscountScope, DiscountType } from "@prisma/client";
import { DiscountScopeService } from "./discount-scope.service";
import { ProductPriceResolver } from "./product-price-resolver.service";
import { testCampaign } from "./testing/price-resolver-fixture";

/**
 * BİRLEŞTİRME POLİTİKASI — yürürlükteki kural burada sabitlenir.
 *
 * `isStackable` bir seçenek sunuyormuş gibi hem admin hem satıcı formunda
 * duruyordu, ama motor bu alanı hiçbir zaman okumadı. Alan formlardan
 * kaldırıldı ve API'de deprecated işaretlendi; yerine geçen kural şudur:
 *
 *   1. Ürünün kendi indirimi ile otomatik kampanya ÜST ÜSTE biner
 *      (kampanya, indirim uygulanmış fiyatın üzerine iner).
 *   2. Birden fazla otomatik kampanya TOPLANMAZ — alıcı lehine olan tek
 *      kampanya uygulanır.
 *   3. Kupon her zaman kampanya sonrası fiyatın üstüne biner.
 *   4. `isStackable` değeri sonucu DEĞİŞTİRMEZ.
 *
 * Kural değişecekse önce bu testler değişmeli.
 */
describe("indirim birleştirme politikası", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  const makeResolver = (campaigns: unknown[]) => {
    const prisma = {
      discount: {
        findMany: async ({ where }: any = {}) =>
          campaigns.filter((row: any) => {
            if (where?.code === null && row.code != null) return false;
            if (where?.isBatch === false && row.isBatch === true) return false;
            return true;
          }),
      },
      category: { findMany: async () => [] },
    } as any;
    return new ProductPriceResolver(prisma, new DiscountScopeService(prisma));
  };

  /** 100 TL liste → 80 TL satış (satıcının kendi indirimi yürürlükte). */
  const discountedProduct = {
    id: "product-1",
    sellerId: "seller-1",
    categoryId: "category-1",
    price: 80,
    oldPrice: 100,
    saleStartDate: new Date("2026-06-01"),
    saleEndDate: new Date("2026-06-30"),
  };

  it("1) ürün indirimi + kampanya üst üste biner", async () => {
    const resolved = await makeResolver([
      testCampaign({ type: DiscountType.percentage, value: 25 }),
    ]).resolveOne(discountedProduct, { now });

    // 100 → 80 (satıcı) → 60 (kampanya %25). Kampanya listeye değil, satış
    // fiyatına uygulanır.
    expect(resolved.saleUnitPrice).toBe(80);
    expect(resolved.unitPrice).toBe(60);
    expect(resolved.originalUnitPrice).toBe(100);
  });

  it("2) birden fazla kampanya toplanmaz; en avantajlısı uygulanır", async () => {
    const resolved = await makeResolver([
      testCampaign({ id: "c1", value: 10 }),
      testCampaign({ id: "c2", value: 25 }),
      testCampaign({ id: "c3", value: 15 }),
    ]).resolveOne(discountedProduct, { now });

    // Toplansaydı 80 − 50 = 30 olurdu; kural "tek kampanya" olduğu için 55.
    expect(resolved.unitPrice).toBe(55);
    expect(resolved.campaign?.discountId).toBe("c2");
  });

  it("3) kupon kampanya SONRASI fiyatın üstüne biner", async () => {
    const resolved = await makeResolver([
      testCampaign({ value: 20 }),
    ]).resolveOne(discountedProduct, { now });

    // Kuponun matrahı, checkout'un allocateCoupon'a verdiği satır tutarıdır:
    // yani kampanya uygulanmış birim fiyat × adet.
    expect(resolved.unitPrice).toBe(60);
  });

  describe("4) isStackable sonucu değiştirmez", () => {
    const bothWays = [true, false];

    it.each(bothWays)(
      "isStackable=%s → tek kampanya kuralı aynı kalır",
      async (isStackable) => {
        const resolved = await makeResolver([
          testCampaign({ id: "c1", value: 10, isStackable } as any),
          testCampaign({ id: "c2", value: 25, isStackable } as any),
        ]).resolveOne(discountedProduct, { now });

        expect(resolved.unitPrice).toBe(55);
        expect(resolved.campaign?.discountId).toBe("c2");
      },
    );

    it.each(bothWays)(
      "isStackable=%s → ürün indirimi + kampanya yine birlikte uygulanır",
      async (isStackable) => {
        const resolved = await makeResolver([
          testCampaign({ value: 20, isStackable } as any),
        ]).resolveOne(discountedProduct, { now });

        expect(resolved.unitPrice).toBe(60);
      },
    );
  });

  it("kampanya kapsam dışıysa yalnız ürünün kendi indirimi kalır", async () => {
    const resolved = await makeResolver([
      testCampaign({
        scope: DiscountScope.seller,
        sellerId: "başka-satıcı",
        value: 25,
      }),
    ]).resolveOne(discountedProduct, { now });

    expect(resolved.unitPrice).toBe(80);
    expect(resolved.campaign).toBeNull();
  });
});
