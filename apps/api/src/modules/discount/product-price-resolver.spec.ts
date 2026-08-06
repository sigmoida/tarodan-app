import { DiscountScope, DiscountType } from "@prisma/client";
import { DiscountScopeService } from "./discount-scope.service";
import { ProductPriceResolver } from "./product-price-resolver.service";
import { testCampaign } from "./testing/price-resolver-fixture";

const CATEGORY_TREE = [
  { id: "root", parentId: null },
  { id: "diecast", parentId: "root" },
  { id: "diecast-118", parentId: "diecast" },
];

const makeResolver = (campaigns: unknown[] = []) => {
  const prisma = {
    discount: { findMany: async () => campaigns },
    category: { findMany: async () => CATEGORY_TREE },
  } as any;
  return new ProductPriceResolver(prisma, new DiscountScopeService(prisma));
};

const product = (overrides: Record<string, unknown> = {}) => ({
  id: "product-1",
  sellerId: "seller-1",
  categoryId: "diecast-118",
  price: 100,
  ...overrides,
});

describe("ProductPriceResolver", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  describe("ürünün kendi indirimi", () => {
    it("pencere içindeyken indirimli fiyatı satar, indirim öncesini çizer", async () => {
      const resolved = await makeResolver().resolveOne(
        product({
          price: 80,
          oldPrice: 100,
          saleStartDate: new Date("2026-06-01"),
          saleEndDate: new Date("2026-06-30"),
        }),
        { now },
      );

      expect(resolved.unitPrice).toBe(80);
      expect(resolved.originalUnitPrice).toBe(100);
      expect(resolved.isOnSale).toBe(true);
    });

    it("pencere kapandıysa indirim ÖNCESİ fiyattan satar", async () => {
      const resolved = await makeResolver().resolveOne(
        product({
          price: 80,
          oldPrice: 100,
          saleStartDate: new Date("2026-01-01"),
          saleEndDate: new Date("2026-02-01"),
        }),
        { now },
      );

      expect(resolved.unitPrice).toBe(100);
      expect(resolved.isOnSale).toBe(false);
    });
  });

  describe("kampanya", () => {
    it("ürünün kendi indiriminin ÜSTÜNE biner", async () => {
      const resolved = await makeResolver([
        testCampaign({ type: DiscountType.percentage, value: 10 }),
      ]).resolveOne(
        product({
          price: 80,
          oldPrice: 100,
          saleStartDate: new Date("2026-06-01"),
          saleEndDate: new Date("2026-06-30"),
        }),
        { now },
      );

      // 100 → (kendi indirimi) 80 → (kampanya %10) 72
      expect(resolved.saleUnitPrice).toBe(80);
      expect(resolved.unitPrice).toBe(72);
    });

    it("birden fazla kampanya varsa TOPLANMAZ, en avantajlısı uygulanır", async () => {
      const resolved = await makeResolver([
        testCampaign({ id: "c1", value: 10 }),
        testCampaign({ id: "c2", value: 30 }),
        testCampaign({ id: "c3", value: 20 }),
      ]).resolveOne(product(), { now });

      expect(resolved.unitPrice).toBe(70);
      expect(resolved.campaign?.discountId).toBe("c2");
    });

    it("birim fiyattan fazlasını indiremez (bozuk yüzde fiyatı negatife çevirmez)", async () => {
      const resolved = await makeResolver([
        testCampaign({ type: DiscountType.percentage, value: 150 }),
      ]).resolveOne(product(), { now });

      expect(resolved.unitPrice).toBe(0);
    });

    it("maxDiscountAmount tavanı BİRİM başına uygulanır", async () => {
      const resolved = await makeResolver([
        testCampaign({
          type: DiscountType.percentage,
          value: 50,
          maxDiscountAmount: 10,
        }),
      ]).resolveOne(product({ price: 100 }), { now });

      // %50 = 50 TL ama tavan 10 → birim fiyat 90.
      expect(resolved.unitPrice).toBe(90);
    });
  });

  describe("minCartValue", () => {
    const gated = [testCampaign({ value: 20, minCartValue: 150 })];

    it("sepet tabanı eşiğin altındaysa kampanya UYGULANMAZ", async () => {
      const resolved = await makeResolver(gated).resolveMany(
        [{ product: product(), quantity: 1 }],
        { now, minCartValueBasis: "cart" },
      );

      expect(resolved.get("product-1")?.unitPrice).toBe(100);
    });

    it("sepet tabanı eşiği geçince kampanya uygulanır", async () => {
      const resolved = await makeResolver(gated).resolveMany(
        [{ product: product(), quantity: 2 }],
        { now, minCartValueBasis: "cart" },
      );

      expect(resolved.get("product-1")?.unitPrice).toBe(80);
    });

    it("satır tabanında sayfadaki DİĞER ürünler eşiğe sayılmaz", async () => {
      // Liste sayfası: iki ayrı 100 TL'lik ürün. Toplamları 200 olsa da hiçbiri
      // tek başına 150'yi geçmediği için kampanya görünmemeli.
      const resolved = await makeResolver(gated).resolveMany(
        [
          { product: product({ id: "product-1" }) },
          { product: product({ id: "product-2" }) },
        ],
        { now, minCartValueBasis: "line" },
      );

      expect(resolved.get("product-1")?.unitPrice).toBe(100);
      expect(resolved.get("product-2")?.unitPrice).toBe(100);
    });
  });

  describe("kapsam", () => {
    it("ÜST kategoriye tanımlı kampanya alt kategorideki ürünü de kapsar", async () => {
      const resolved = await makeResolver([
        testCampaign({
          scope: DiscountScope.category,
          categoryId: "root",
          value: 25,
        }),
      ]).resolveOne(product({ categoryId: "diecast-118" }), { now });

      expect(resolved.unitPrice).toBe(75);
    });

    it("kardeş kategorinin kampanyası uygulanmaz", async () => {
      const resolved = await makeResolver([
        testCampaign({
          scope: DiscountScope.category,
          categoryId: "diecast-118",
          value: 25,
        }),
      ]).resolveOne(product({ categoryId: "diecast" }), { now });

      expect(resolved.unitPrice).toBe(100);
    });

    it("başka satıcının mağaza kampanyası uygulanmaz", async () => {
      const resolved = await makeResolver([
        testCampaign({
          scope: DiscountScope.seller,
          sellerId: "seller-2",
          value: 25,
        }),
      ]).resolveOne(product(), { now });

      expect(resolved.unitPrice).toBe(100);
    });

    it("hedef listesi boş bir ürün kampanyası hiçbir ürünü kapsamaz", async () => {
      const resolved = await makeResolver([
        testCampaign({
          scope: DiscountScope.product,
          targetProductIds: [],
          value: 25,
        }),
      ]).resolveOne(product(), { now });

      expect(resolved.unitPrice).toBe(100);
    });
  });
});
