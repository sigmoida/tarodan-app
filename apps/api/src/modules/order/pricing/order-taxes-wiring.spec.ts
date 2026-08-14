import { OrderCheckoutCommonService } from "../checkout/order-checkout-common.service";
import { OrderTaxPolicyService } from "./order-tax-policy.service";

/**
 * `resolveOrderTaxes` — bir sipariş satırının TÜM vergileri tek çağrıda:
 * ürün KDV'si (politikayla kapalı), hizmet KDV'si (iki taraf) ve stopaj.
 *
 * Checkout yollarının hepsi (grup / direct / teklif / misafir) buraya delege
 * eder; önizleme ile tahsilatın ayrışmaması buna bağlı.
 */
describe("OrderCheckoutCommonService.resolveOrderTaxes", () => {
  const FEES = {
    buyerCommissionAmount: 20,
    buyerServiceFeeAmount: 25,
    buyerShippingAmount: 50,
    sellerCommissionAmount: 30,
    sellerPlatformFeeAmount: 25,
    sellerShippingAmount: 50,
  };

  const makeService = (opts?: {
    settings?: Record<string, string>;
    isCorporate?: boolean;
    productVatRate?: number;
  }) => {
    const isCorporate = opts?.isCorporate ?? false;
    const rows = Object.entries(opts?.settings ?? {}).map(
      ([settingKey, settingValue]) => ({ settingKey, settingValue }),
    );
    const prisma = {
      platformSetting: { findMany: jest.fn().mockResolvedValue(rows) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          businessStatus: isCorporate ? "approved" : null,
          taxId: isCorporate ? "1234567890" : null,
        }),
      },
    };
    const taxService = {
      resolveTaxRate: jest.fn().mockResolvedValue({
        taxRateId: "t1",
        rate: opts?.productVatRate ?? 20,
        name: "%20",
      }),
      calculateTaxAmount: jest.fn(
        (subtotal: number, resolved: { rate: number } | null) =>
          resolved ? Math.round(subtotal * resolved.rate) / 100 : 0,
      ),
    };
    const policy = new OrderTaxPolicyService(prisma as any);
    const service = new OrderCheckoutCommonService(
      prisma as any,
      {} as any, // suratCargoService
      taxService as any,
      {} as any, // orderPricing
      policy,
    );
    return { service, prisma, taxService };
  };

  it("varsayılan politika: ürün KDV'si 0, hizmet KDV'si iki tarafta, bireyselde stopaj yok", async () => {
    const { service, taxService } = makeService({ isCorporate: false });

    const result = await service.resolveOrderTaxes({
      sellerId: "s1",
      categoryId: "c1",
      subtotal: 500,
      fees: FEES,
    });

    expect(result.taxAmount).toBe(0);
    expect(result.buyerServiceTaxAmount).toBe(19);
    expect(result.sellerServiceTaxAmount).toBe(21);
    // Bireysel satıcı stopaj kapsamı dışındadır.
    expect(result.withholdingTaxAmount).toBe(0);
    // Ürün KDV'si kapalıyken vergi kuralı hiç sorgulanmaz.
    expect(taxService.resolveTaxRate).not.toHaveBeenCalled();
  });

  it("kurumsal satıcıda da ürün KDV'si kapalı kalır (politika tek karar noktası)", async () => {
    const { service } = makeService({ isCorporate: true });

    const result = await service.resolveOrderTaxes({
      sellerId: "s1",
      categoryId: "c1",
      subtotal: 500,
      fees: FEES,
    });

    expect(result.taxAmount).toBe(0);
    expect(result.withholdingTaxAmount).toBe(5);
  });

  it("hizmet KDV'si kapatılırsa iki taraf da sıfırlanır", async () => {
    const { service } = makeService({
      settings: { service_vat_enabled: "false" },
    });

    const result = await service.resolveOrderTaxes({
      sellerId: "s1",
      categoryId: "c1",
      subtotal: 500,
      fees: FEES,
    });

    expect(result.buyerServiceTaxAmount).toBe(0);
    expect(result.sellerServiceTaxAmount).toBe(0);
  });

  it("stopaj bireysel kapsamı ayarla kapatılabilir", async () => {
    const { service } = makeService({
      isCorporate: false,
      settings: { withholding_applies_to_individual: "false" },
    });

    const result = await service.resolveOrderTaxes({
      sellerId: "s1",
      categoryId: "c1",
      subtotal: 500,
      fees: FEES,
    });

    expect(result.withholdingTaxAmount).toBe(0);
  });

  it("oran admin'den değişince hizmet KDV'si onunla hesaplanır", async () => {
    const { service } = makeService({ settings: { service_vat_rate: "10" } });

    const result = await service.resolveOrderTaxes({
      sellerId: "s1",
      categoryId: "c1",
      subtotal: 500,
      fees: FEES,
    });

    expect(result.buyerServiceTaxAmount).toBe(9.5);
    expect(result.sellerServiceTaxAmount).toBe(10.5);
  });
});
