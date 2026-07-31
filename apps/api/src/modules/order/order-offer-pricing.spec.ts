import { OrderCheckoutCommonService } from "./order-checkout-common.service";
import { OrderTaxPolicyService } from "./order-tax-policy.service";
import { resolvePackageShippingDecision } from "../shipping/shipping-tariff.helper";
import { flatPackageTiers } from "../shipping/testing/tariff-fixture";

/**
 * BLOCKER: teklif kabul edildiğinde sipariş `offer.service` içinde
 * `totalAmount = teklif + alıcı ücreti` ile yaratılıyor; `taxAmount`,
 * `withholdingTaxAmount` ve `shippingCost` @default(0) kalıyordu. Adres PATCH'i
 * de hiçbir şeyi yeniden hesaplamıyor, ödeme `order.totalAmount`'ı olduğu gibi
 * tahsil ediyor. Sonuç: kurumsal (KDV mükellefi) satıcının her teklif satışında
 * KDV tahsil edilmiyor, stopaj kesilmiyor ve kargo bedava veriliyor.
 *
 * Çözüm: teklif bazlı sipariş bedelleri TEK bir primitiften gelir; hem kabul
 * anındaki oluşturma hem klasik `POST /orders` yolu aynı hesabı kullanır.
 */
describe("OrderCheckoutCommonService.resolveOfferOrderPricing", () => {
  const tariff = {
    outboundPackageFee: 50,
    freeShippingEnabled: false,
    freeShippingThreshold: 0,
    packageTiers: flatPackageTiers(50),
  } as any;

  const makeService = (opts: {
    corporate: boolean;
    buyerShare?: number;
    withholdingRate?: number;
    /** Ürün KDV'si varsayılan KAPALI; eski davranışı ölçen testler açar. */
    productVat?: boolean;
  }) => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            opts.corporate
              ? { businessStatus: "approved", taxId: "1234567890" }
              : { businessStatus: "pending", taxId: null },
          ),
      },
      platformSetting: {
        findMany: jest.fn().mockResolvedValue([
          ...(opts.withholdingRate != null
            ? [
                {
                  settingKey: "withholding_tax_rate",
                  settingValue: String(opts.withholdingRate),
                },
              ]
            : []),
          ...(opts.productVat
            ? [{ settingKey: "product_vat_enabled", settingValue: "true" }]
            : []),
        ]),
      },
    };
    const taxService = {
      resolveTaxRate: jest.fn().mockResolvedValue({ rate: 20 }),
      calculateTaxAmount: jest
        .fn()
        .mockImplementation(
          (amount: number) => Math.round(amount * 0.2 * 100) / 100,
        ),
    };
    const orderPricing = {
      calculateCommission: jest.fn().mockResolvedValue({
        buyerFeeAmount: 10,
        sellerFeeAmount: 20,
        commissionAmount: 30,
        buyerCommissionAmount: 4,
        buyerServiceFeeAmount: 6,
        sellerCommissionAmount: 15,
        sellerPlatformFeeAmount: 5,
        shippingBuyerShare: opts.buyerShare ?? 100,
        shippingBuyerShares: {
          small: opts.buyerShare ?? 100,
          medium: opts.buyerShare ?? 100,
          large: opts.buyerShare ?? 100,
        },
        sellerRuleId: "r1",
      }),
      // Kargo kararı OrderPricingService'te tek noktadan verilir; burada gerçek
      // yardımcıya delege ederek kademe→pay→bölüşüm zincirini olduğu gibi ölçüyoruz.
      resolveShippingDecision: jest
        .fn()
        .mockImplementation((args: any) =>
          resolvePackageShippingDecision(args),
        ),
    };
    const service = new OrderCheckoutCommonService(
      prisma as any,
      {} as any, // suratCargoService — bu primitif kargo entegrasyonuna dokunmaz
      taxService as any,
      orderPricing as any,
      new OrderTaxPolicyService(prisma as any),
    );
    return { service, orderPricing };
  };

  const params = {
    amount: 1000,
    sellerId: "s1",
    categoryId: "c1",
    shippingDesi: 1,
    shippingTariff: tariff,
  };

  // Hizmet KDV matrahları: alıcı 4 + 6 + kargo, satıcı 15 + 5 + kargo.
  it("ürün KDV'si AÇIKKEN kurumsal satıcı: ürün KDV'si + stopaj + hizmet KDV'si", async () => {
    const { service } = makeService({
      corporate: true,
      withholdingRate: 1,
      productVat: true,
    });

    const pricing = await service.resolveOfferOrderPricing(params);

    expect(pricing.taxAmount).toBe(200); // 1000 * %20
    expect(pricing.withholdingTaxAmount).toBe(10); // 1000 * %1
    // Alıcı hizmet KDV'si: (4 + 6 + 50) * %20 = 12
    expect(pricing.buyerServiceTaxAmount).toBe(12);
    // Satıcı hizmet KDV'si: (15 + 5 + 0) * %20 = 4
    expect(pricing.sellerServiceTaxAmount).toBe(4);
    // toplam = teklif + alıcı kargosu + alıcı ücreti + ürün KDV + alıcı hizmet KDV
    expect(pricing.totalAmount).toBe(1000 + 50 + 10 + 200 + 12);
  });

  it("varsayılan politika: ürün KDV'si 0, hizmet KDV'si yine tahsil edilir", async () => {
    const { service } = makeService({ corporate: true, withholdingRate: 1 });

    const pricing = await service.resolveOfferOrderPricing(params);

    expect(pricing.taxAmount).toBe(0);
    expect(pricing.buyerServiceTaxAmount).toBe(12);
    expect(pricing.totalAmount).toBe(1000 + 50 + 10 + 12);
  });

  it("bireysel satıcı: ürün KDV'si yok, stopaj ARTIK kesilir, kargo tahsil edilir", async () => {
    const { service } = makeService({ corporate: false, withholdingRate: 1 });

    const pricing = await service.resolveOfferOrderPricing(params);

    expect(pricing.taxAmount).toBe(0);
    // Stopaj kapsamı genişledi: bireysel satıcıdan da kesiliyor.
    expect(pricing.withholdingTaxAmount).toBe(10);
    expect(pricing.buyerShippingAmount).toBe(50);
    expect(pricing.totalAmount).toBe(1000 + 50 + 10 + 12);
  });

  it("kargo payı kurala göre bölünür; KDV de aynı bölüşümü izler", async () => {
    const { service } = makeService({ corporate: false, buyerShare: 40 });

    const pricing = await service.resolveOfferOrderPricing(params);

    expect(pricing.fullShippingAmount).toBe(50);
    expect(pricing.buyerShippingAmount).toBe(20);
    expect(pricing.sellerShippingAmount).toBe(30);
    // Alıcı: (4 + 6 + 20) * %20 = 6 · Satıcı: (15 + 5 + 30) * %20 = 10
    expect(pricing.buyerServiceTaxAmount).toBe(6);
    expect(pricing.sellerServiceTaxAmount).toBe(10);
    expect(pricing.totalAmount).toBe(1000 + 20 + 10 + 6);
  });

  it("komisyon kırılımı olduğu gibi taşınır (v2 4 ücret)", async () => {
    const { service } = makeService({ corporate: false });

    const pricing = await service.resolveOfferOrderPricing(params);

    expect(pricing.commission.sellerCommissionAmount).toBe(15);
    expect(pricing.commission.buyerServiceFeeAmount).toBe(6);
  });

  it("teklif tutarı komisyon ve vergi hesaplarına baz olarak geçirilir", async () => {
    const { service, orderPricing } = makeService({
      corporate: true,
      productVat: true,
    });

    await service.resolveOfferOrderPricing(params);

    expect(orderPricing.calculateCommission).toHaveBeenCalledWith(
      1000,
      "s1",
      "c1",
    );
    expect(orderPricing.resolveShippingDecision).toHaveBeenCalledWith(
      expect.objectContaining({ tariff, subtotal: 1000, billableDesi: 1 }),
    );
  });
});
