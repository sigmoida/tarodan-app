import { OrderPricingService } from "./order-pricing.service";
import { ProductStatus } from "@prisma/client";
import { flatPackageTiers } from "../shipping/testing/tariff-fixture";
import { testTaxPolicy } from "./testing/tax-policy-fixture";

/**
 * Checkout quote kargosu artık SATICI-BAŞINA (create ile ortak calculateShippingBySeller).
 * Eskiden quote birleşik alt-toplamda TEK kargo hesaplıyordu → çoklu-satıcı sepette
 * alıcıya AZ gösterilip create'te FAZLA tahsil ediliyordu. Bu spec o tutarlılığı sabitler.
 */
describe("OrderPricingService.getCheckoutQuote — per-seller shipping", () => {
  const BASE = 50;
  const THRESHOLD = 500;

  // sellerId -> price
  const products: Record<string, any> = {
    a1: mkProduct("a1", "seller-A", 100),
    a2: mkProduct("a2", "seller-A", 100),
    b1: mkProduct("b1", "seller-B", 100),
    aBig: mkProduct("aBig", "seller-A", 300),
    bBig: mkProduct("bBig", "seller-B", 300),
  };

  function mkProduct(id: string, sellerId: string, price: number) {
    return {
      id,
      title: id,
      price,
      sellerId,
      categoryId: null,
      status: ProductStatus.active,
      seller: { businessStatus: "pending", taxId: null }, // non-corporate → KDV yok
    };
  }

  const makeSvc = () => {
    const prisma = {
      platformSetting: {
        // Vergi politikası tek sorguda okunur (OrderTaxPolicyService).
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(({ where }: any) => {
          if (where.settingKey === "shipping_base_cost")
            return Promise.resolve({ settingValue: String(BASE) });
          if (where.settingKey === "free_shipping_threshold")
            return Promise.resolve({ settingValue: String(THRESHOLD) });
          return Promise.resolve(null);
        }),
      },
      product: {
        findUnique: jest.fn(({ where }: any) =>
          Promise.resolve(products[where.id] ?? null),
        ),
      },
    } as any;
    const taxService = {
      resolveTaxRate: jest.fn(),
      calculateTaxAmount: jest.fn(),
    } as any;
    const shippingTariffs = {
      getActiveOutboundTariff: async () => ({
        freeShippingEnabled: true,
        freeShippingThreshold: THRESHOLD,
        packageTiers: flatPackageTiers(BASE),
      }),
      getActiveTariffSnapshot: async () => ({
        tariffId: "tariff-1",
        tariffVersion: 1,
        tariff: {
          freeShippingEnabled: true,
          freeShippingThreshold: THRESHOLD,
          packageTiers: flatPackageTiers(BASE),
        },
      }),
    } as any;
    const svc = new OrderPricingService(
      prisma,
      taxService,
      shippingTariffs,
      {
        getEffectiveDisplayPrice: async () => null,
        getEffectiveDisplayPriceMany: async () => new Map(),
      } as any,
      testTaxPolicy(),
    );
    // Komisyonu izole et — bu spec yalnız kargoyu ölçer.
    jest
      .spyOn(svc, "calculateCommission")
      .mockResolvedValue({ buyerFeeAmount: 0, sellerFeeAmount: 0 } as any);
    return svc;
  };

  it("tek satıcı tek ürün (eşik altı) → 1 kargo", async () => {
    const q = await makeSvc().getCheckoutQuote({
      items: [{ productId: "a1" }],
    });
    expect(q.shippingBySeller).toHaveLength(1);
    expect(q.shippingAmount).toBe(BASE);
    expect(q.items[0].sellerId).toBe("seller-A");
  });

  it("tek satıcı ÇOK ürün (birleşik 200 < eşik) → yine TEK kargo (konsolidasyon)", async () => {
    const q = await makeSvc().getCheckoutQuote({
      items: [{ productId: "a1" }, { productId: "a2" }],
    });
    expect(q.shippingBySeller).toHaveLength(1);
    expect(q.shippingAmount).toBe(BASE); // 2 ürün ama tek satıcı → tek kargo
  });

  it("ÇOK satıcı (her biri eşik altı) → satıcı başına kargo (2 satıcı = 2 kargo, 1 değil)", async () => {
    const q = await makeSvc().getCheckoutQuote({
      items: [{ productId: "a1" }, { productId: "b1" }],
    });
    expect(q.shippingBySeller).toHaveLength(2);
    expect(q.shippingAmount).toBe(BASE * 2); // BUG öncesi bu BASE idi (az-göster)
    // subtotal + 2 kargo + kargo payının hizmet KDV'si (%20). Quote eskiden
    // hizmet KDV'sini hiç eklemiyordu ve tahsil edilenden düşük gösteriyordu.
    expect(q.totalAmount).toBe(200 + BASE * 2 + BASE * 2 * 0.2);
  });

  it("ÇOK satıcı: BİRLEŞİK toplam eşiği geçse de her satıcı eşik altıysa kargo ÜCRETSİZ OLMAZ", async () => {
    // 300 + 300 = 600 >= 500 (birleşik), ama her satıcı 300 < 500 → ikisi de ücretli.
    // Eski birleşik mantık burada YANLIŞLIKLA "ücretsiz" (0) gösteriyordu.
    const q = await makeSvc().getCheckoutQuote({
      items: [{ productId: "aBig" }, { productId: "bBig" }],
    });
    expect(q.shippingAmount).toBe(BASE * 2);
    expect(q.shippingBySeller.every((s) => s.shippingCost === BASE)).toBe(true);
  });

  it("tek satıcı, birleşik eşik üstü → ücretsiz (0)", async () => {
    // aBig(300) + a2(100)+a1(100) = 500 >= 500, tek satıcı → 0
    const q = await makeSvc().getCheckoutQuote({
      items: [{ productId: "aBig" }, { productId: "a1" }, { productId: "a2" }],
    });
    expect(q.shippingBySeller).toHaveLength(1);
    expect(q.shippingAmount).toBe(0);
  });

  describe("pricing.summary — ekranın bastığı satırlar", () => {
    /**
     * Sepet ve checkout artık kendi kırılımını ÜRETMEZ; `pricing.summary`'yi
     * olduğu gibi basar. Bu yüzden dört alanın toplamı `total`'a KURUŞU
     * KURUŞUNA eşit olmak zorunda — aksi halde ekranda satırlar toplamı
     * vermez. Ekranlar KDV'yi kendileri dağıttığında kargonun KDV'si ücret
     * satırına yığılıyordu: aynı sepet iki ekranda farklı kırılım gösteriyordu.
     */
    it("üç satırın toplamı ödenecek tutarı birebir verir", async () => {
      const q = await makeSvc().getCheckoutQuote({
        items: [{ productId: "a1" }, { productId: "b1" }],
      });
      const s = q.pricing.summary;

      expect(
        Math.round(
          (s.productAmount + s.shippingAmount + s.serviceFeeAmount) * 100,
        ) / 100,
      ).toBe(s.total);
      expect(s.total).toBe(q.pricing.totalAmount);
    });

    it("kargo satırı tarifeden gelen SABİT tutardır, KDV eklenmez", async () => {
      const q = await makeSvc().getCheckoutQuote({
        items: [{ productId: "a1" }],
      });
      const s = q.pricing.summary;

      expect(s.shippingAmount).toBe(q.pricing.shippingAmount);
    });

    it("hizmet KDV'sinin TAMAMI hizmet bedeli satırına yazılır", async () => {
      const q = await makeSvc().getCheckoutQuote({
        items: [{ productId: "a1" }],
      });
      const s = q.pricing.summary;

      // Kargonun KDV'si de bu satırdadır — alıcı için kargo sabit bir kalem.
      expect(s.serviceFeeAmount).toBe(
        Math.round(
          (q.pricing.buyerFeeAmount + q.pricing.buyerServiceTaxAmount) * 100,
        ) / 100,
      );
    });
  });
});
