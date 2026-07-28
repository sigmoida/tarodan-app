import { OrderPricingService } from "./order-pricing.service";
import { ProductStatus } from "@prisma/client";

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
        outboundPackageFee: BASE,
        freeShippingEnabled: true,
        freeShippingThreshold: THRESHOLD,
      }),
      getActiveTariffSnapshot: async () => ({
        tariffId: "tariff-1",
        tariffVersion: 1,
        tariff: {
          outboundPackageFee: BASE,
          freeShippingEnabled: true,
          freeShippingThreshold: THRESHOLD,
        },
      }),
    } as any;
    const svc = new OrderPricingService(prisma, taxService, shippingTariffs, {
      getEffectiveDisplayPrice: async () => null,
      getEffectiveDisplayPriceMany: async () => new Map(),
    } as any);
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
    expect(q.totalAmount).toBe(200 + BASE * 2); // subtotal + 2 kargo
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
});
