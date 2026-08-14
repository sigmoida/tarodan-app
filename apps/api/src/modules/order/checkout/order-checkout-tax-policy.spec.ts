import { OrderCheckoutCommonService } from "./order-checkout-common.service";
import { OrderTaxPolicyService } from "../pricing/order-tax-policy.service";

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

  it("ürün KDV'si sistemde YOK: vergi kuralı aranmaz, checkout durmaz", async () => {
    // Ürün bedeline KDV uygulanmıyor (vitrin fiyatı KDV dahil, beyanı satıcıya
    // ait). Bu yüzden kategoriye vergi kuralı tanımlı olmaması checkout'u
    // durdurmaz — eskiden kurumsal satıcıda fail-closed 503 veriyordu.
    // Stopaj devam eder (1000 x %1 = 10).
    const { service, taxService } = makeService({});

    await expect(
      service.resolveSellerTaxes("seller-1", "category-1", 1000),
    ).resolves.toEqual({ taxAmount: 0, withholdingTaxAmount: 10 });
    expect(taxService.resolveTaxRate).not.toHaveBeenCalled();
  });
});
