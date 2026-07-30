import { OrderCheckoutCommonService } from "./order-checkout-common.service";

describe("OrderCheckoutCommonService corporate seller tax policy", () => {
  it("fails closed when an approved taxable seller has no applicable tax rule", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          businessStatus: "approved",
          taxId: "1234567890",
        }),
      },
      platformSetting: {
        findUnique: jest.fn().mockResolvedValue({
          settingValue: "1",
        }),
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
    );

    await expect(
      service.resolveSellerTaxes("seller-1", "category-1", 1000),
    ).rejects.toThrow();
    expect(taxService.calculateTaxAmount).not.toHaveBeenCalled();
  });
});
