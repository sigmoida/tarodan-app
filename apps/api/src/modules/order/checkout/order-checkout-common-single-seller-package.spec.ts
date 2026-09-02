import { OrderCheckoutCommonService } from "./order-checkout-common.service";

/**
 * Teklif siparişi ve misafir satın alma tek satıcılı KOLİ'yi bu yardımcıdan
 * alır: koli numarası PKG-…, tarife snapshot'ı ve desi koliye yazılır,
 * `checkoutGroupId` null ise grup açılmaz (teklif yolu).
 */
describe("OrderCheckoutCommonService.createSingleSellerPackage", () => {
  const shippingTariff = {
    tariffId: "tariff-1",
    tariffVersion: 4,
    tariff: { provider: "surat" },
  } as any;

  const makeService = () => {
    const prisma = {
      orderPackage: { count: jest.fn().mockResolvedValue(0) },
      order: { count: jest.fn().mockResolvedValue(0) },
    };
    const orderPricing = {
      computePricingHash: jest.fn().mockReturnValue("hash-1"),
      resolveShippingTariffSnapshot: jest
        .fn()
        .mockResolvedValue(shippingTariff),
      resolveCommissionRuleSetSnapshot: jest
        .fn()
        .mockResolvedValue({ id: "rs-1", version: 2 }),
    };
    const service = new OrderCheckoutCommonService(
      prisma as any,
      {} as any,
      {} as any,
      orderPricing as any,
      {} as any,
    );
    const tx = {
      orderPackage: {
        create: jest.fn().mockImplementation(async (arg: any) => ({
          id: "pkg-1",
          packageNumber: arg.data.packageNumber,
        })),
      },
    };
    return { service, tx, orderPricing };
  };

  it("PKG- numaralı koliyi tarife snapshot'ı ve desi ile yazar", async () => {
    const { service, tx } = makeService();

    const pkg = await service.createSingleSellerPackage(tx as any, {
      sellerId: "seller-1",
      buyerId: "buyer-1",
      checkoutGroupId: null,
      billableDesi: 3,
      shippingTariff,
      fullShippingAmount: 90,
      buyerShippingAmount: 60,
      sellerShippingAmount: 30,
    });

    expect(pkg.id).toBe("pkg-1");
    expect(pkg.packageNumber).toMatch(
      /^PKG-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/,
    );
    const data = tx.orderPackage.create.mock.calls[0][0].data;
    expect(data).toEqual(
      expect.objectContaining({
        checkoutGroupId: null,
        sellerId: "seller-1",
        buyerId: "buyer-1",
        shippingCost: 60,
        shippingTariffId: "tariff-1",
        shippingTariffVersion: 4,
        billableDesi: 3,
        fullShippingAmount: 90,
        buyerShippingAmount: 60,
        sellerShippingAmount: 30,
      }),
    );
    expect(data.shippingPricingSnapshot).toEqual({
      provider: "surat",
      tariffId: "tariff-1",
      tariffVersion: 4,
      billableDesi: 3,
      fullShippingAmount: 90,
    });
  });

  it("grup verilirse koli gruba bağlanır (misafir yolu)", async () => {
    const { service, tx } = makeService();

    await service.createSingleSellerPackage(tx as any, {
      sellerId: "seller-1",
      buyerId: "guest-1",
      checkoutGroupId: "grp-1",
      billableDesi: 1,
      shippingTariff,
      fullShippingAmount: 0,
      buyerShippingAmount: 0,
      sellerShippingAmount: 0,
    });

    expect(tx.orderPackage.create.mock.calls[0][0].data.checkoutGroupId).toBe(
      "grp-1",
    );
  });

  it("snapshot'lar tarife ve kural setini birlikte döner", async () => {
    const { service, orderPricing } = makeService();

    const snap = await service.resolveOfferOrderSnapshots();

    expect(snap.shippingTariff).toBe(shippingTariff);
    expect(snap.commissionRuleSet.id).toBe("rs-1");
    expect(orderPricing.resolveShippingTariffSnapshot).toHaveBeenCalledTimes(1);
  });

  it("teklif finans snapshot'ı adet 1, indirimsiz, teklif tutarıyla kurulur", () => {
    const { service, orderPricing } = makeService();
    const pricing = {
      commission: { buyerFeeAmount: 1, sellerFeeAmount: 2 },
      fullShippingAmount: 90,
      buyerShippingAmount: 60,
      sellerShippingAmount: 30,
      taxAmount: 20,
      withholdingTaxAmount: 5,
      buyerServiceTaxAmount: 1,
      sellerServiceTaxAmount: 2,
      totalAmount: 1081,
    } as any;

    const snap: any = service.buildOfferFinancialSnapshot({
      productId: "product-1",
      amount: 1000,
      shippingDesi: 3,
      shippingTariff,
      pricing,
    });

    expect(orderPricing.computePricingHash).toHaveBeenCalledWith([
      { productId: "product-1", unitPrice: 1000, quantity: 1, shippingDesi: 3 },
    ]);
    expect(snap.version).toBe(2);
    expect(snap.pricing).toEqual(
      expect.objectContaining({
        hash: "hash-1",
        quantity: 1,
        unitPrice: 1000,
        originalUnitPrice: 1000,
        subtotal: 1000,
        discountAmount: 0,
        totalAmount: 1081,
      }),
    );
    expect(snap.shipping).toEqual({
      tariffId: "tariff-1",
      tariffVersion: 4,
      fullAmount: 90,
      buyerAmount: 60,
      sellerAmount: 30,
    });
    expect(snap.tax).toEqual({
      amount: 20,
      withholdingAmount: 5,
      buyerServiceAmount: 1,
      sellerServiceAmount: 2,
    });
  });
});
