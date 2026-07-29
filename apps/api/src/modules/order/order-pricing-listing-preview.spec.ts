import { OrderPricingService } from "./order-pricing.service";

describe("OrderPricingService listing commission preview", () => {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        businessStatus: null,
        taxId: null,
      }),
    },
  };
  const shippingTariffs = {
    getActiveOutboundTariff: jest.fn().mockResolvedValue({
      id: "tariff-1",
      version: 3,
      outboundPackageFee: 100,
      freeShippingEnabled: false,
      freeShippingThreshold: null,
      rates: [
        { desi: 1, amount: 100 },
        { desi: 2, amount: 180 },
      ],
    }),
  };
  const service = new OrderPricingService(
    prisma as any,
    {} as any,
    shippingTariffs as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      businessStatus: null,
      taxId: null,
    });
    jest.spyOn(service, "calculateCommission").mockResolvedValue({
      sellerFeeAmount: 100,
      buyerFeeAmount: 30,
      commissionAmount: 130,
      shippingBuyerShare: 40,
    } as any);
  });

  it("deducts the seller share of the exact desi tariff from seller net", async () => {
    const preview = await (service.getCommissionPreview as any)(
      1000,
      "seller-1",
      "category-1",
      2,
    );

    expect(preview).toMatchObject({
      fullShippingAmount: 180,
      buyerShippingAmount: 72,
      sellerShippingAmount: 108,
      shippingAmount: 108,
      sellerNetAmount: 792,
      shippingDesi: 2,
    });
  });

  it("does not deduct shipping when the commission rule assigns it all to buyer", async () => {
    jest.spyOn(service, "calculateCommission").mockResolvedValue({
      sellerFeeAmount: 100,
      buyerFeeAmount: 30,
      commissionAmount: 130,
      shippingBuyerShare: 100,
    } as any);

    const preview = await (service.getCommissionPreview as any)(
      1000,
      "seller-1",
      "category-1",
      2,
    );

    expect(preview.shippingAmount).toBe(0);
    expect(preview.sellerShippingAmount).toBe(0);
    expect(preview.sellerNetAmount).toBe(900);
  });
});
