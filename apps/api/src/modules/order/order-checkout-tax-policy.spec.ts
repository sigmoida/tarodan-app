import { OrderCheckoutCommonService } from "./order-checkout-common.service";
import { OrderTaxPolicyService } from "./order-tax-policy.service";

describe("OrderCheckoutCommonService corporate seller tax policy", () => {
  const makeService = (settings: Record<string, string>) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          businessStatus: "approved",
          taxId: "1234567890",
        }),
      },
      platformSetting: {
        findMany: jest.fn().mockResolvedValue(
          Object.entries(settings).map(([settingKey, settingValue]) => ({
            settingKey,
            settingValue,
          })),
        ),
      },
    };
    const taxService = {
      resolveTaxRate: jest.fn().mockResolvedValue(null),
      calculateTaxAmount: jest.fn(),
    };
    const service = new OrderCheckoutCommonService(
      prisma as any,
      {} as any,
      taxService as any,
      {} as any,
      new OrderTaxPolicyService(prisma as any),
    );
    return { service, taxService };
  };

  it("fails closed when product VAT is ON and an approved taxable seller has no applicable tax rule", async () => {
    const { service, taxService } = makeService({
      product_vat_enabled: "true",
    });

    await expect(
      service.resolveSellerTaxes("seller-1", "category-1", 1000),
    ).rejects.toThrow();
    expect(taxService.calculateTaxAmount).not.toHaveBeenCalled();
  });

  it("does NOT fail closed when product VAT is off — no tax rule is needed", async () => {
    // Varsayılan politika ürün KDV'sini kapatır: vergi kuralının yokluğu artık
    // checkout'u durdurmaz, çünkü ürün bedeline KDV uygulanmıyor.
    // Stopaj ise devam eder (1000 x %1 = 10).
    const { service, taxService } = makeService({});

    await expect(
      service.resolveSellerTaxes("seller-1", "category-1", 1000),
    ).resolves.toEqual({ taxAmount: 0, withholdingTaxAmount: 10 });
    expect(taxService.resolveTaxRate).not.toHaveBeenCalled();
  });
});
