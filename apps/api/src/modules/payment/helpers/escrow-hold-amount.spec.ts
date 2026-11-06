import { Prisma } from "@prisma/client";
import { escrowHoldAmountOf, fullShippingAmountOf } from "./escrow-hold-amount";

describe("escrowHoldAmountOf", () => {
  it("is total - commission - stopaj - service VAT - full shipping + platform-funded discount", () => {
    expect(
      escrowHoldAmountOf({
        totalAmount: new Prisma.Decimal("1000.00"),
        commissionAmount: new Prisma.Decimal("150.00"),
        withholdingTaxAmount: new Prisma.Decimal("8.00"),
        buyerServiceTaxAmount: new Prisma.Decimal("6.00"),
        sellerServiceTaxAmount: new Prisma.Decimal("10.00"),
        buyerShippingAmount: new Prisma.Decimal("60.00"),
        sellerShippingAmount: new Prisma.Decimal("40.00"),
        shippingCost: new Prisma.Decimal("60.00"),
        platformFundedDiscount: new Prisma.Decimal("25.00"),
      }),
    ).toEqual({ sellerAmount: 751, shippingDeficit: 0 });
  });

  it("reads legacy orders without the newer columns as 0 and shippingCost as the full shipping", () => {
    expect(
      escrowHoldAmountOf({
        totalAmount: 500,
        commissionAmount: 50,
        shippingCost: 45,
      }),
    ).toEqual({ sellerAmount: 405, shippingDeficit: 0 });
  });

  it("holds 0 and reports the gap as a shipping deficit when deductions exceed the total", () => {
    expect(
      escrowHoldAmountOf({
        totalAmount: 50,
        commissionAmount: 10,
        buyerShippingAmount: 30,
        sellerShippingAmount: 30.35,
      }),
    ).toEqual({ sellerAmount: 0, shippingDeficit: 20.35 });
  });

  it("rounds to the kuruş", () => {
    expect(
      escrowHoldAmountOf({ totalAmount: 100.005, commissionAmount: 0.001 })
        .sellerAmount,
    ).toBe(100);
  });
});

describe("fullShippingAmountOf", () => {
  it("adds the two shares, else falls back to the legacy shippingCost, else 0", () => {
    expect(
      fullShippingAmountOf({
        buyerShippingAmount: 10,
        sellerShippingAmount: 5,
        shippingCost: 99,
      }),
    ).toBe(15);
    expect(fullShippingAmountOf({ shippingCost: 30 })).toBe(30);
    expect(fullShippingAmountOf({})).toBe(0);
  });
});
