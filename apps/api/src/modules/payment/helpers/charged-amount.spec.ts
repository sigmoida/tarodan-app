import { Prisma } from "@prisma/client";
import {
  chargedAmountOf,
  orderChargedTotalOf,
  refundGoodsPartOf,
} from "./charged-amount";

const d = (value: string) => new Prisma.Decimal(value);

describe("chargedAmountOf", () => {
  it("reads a legacy payment (no charged amount) as its goods total", () => {
    expect(
      chargedAmountOf({ amount: d("1000.00"), chargedAmount: null }).toFixed(2),
    ).toBe("1000.00");
  });

  it("reads a captured installment payment as the charged total C = T + F", () => {
    // Plan 4.4: 1,000.00 TL cart, 3 installments, default rule, k = 1/6.
    expect(
      chargedAmountOf({
        amount: d("1000.00"),
        chargedAmount: d("1066.38"),
      }).toFixed(2),
    ).toBe("1066.38");
  });

  it("reads a single payment captured through an attempt as its charged amount", () => {
    expect(
      chargedAmountOf({
        amount: d("250.50"),
        chargedAmount: d("250.50"),
      }).toFixed(2),
    ).toBe("250.50");
  });

  it("keeps the Decimal (no float rounding)", () => {
    const charged = chargedAmountOf({
      amount: d("0.10"),
      chargedAmount: d("0.30"),
    });
    expect(Prisma.Decimal.isDecimal(charged)).toBe(true);
    expect(charged.minus(d("0.10")).toFixed(2)).toBe("0.20");
  });
});

describe("orderChargedTotalOf", () => {
  it("adds the order's allocated fee to its goods total", () => {
    // Plan 4.4: two sellers, orders 600.00 and 400.00, F 66.38 split 39.83 /
    // 26.55 by largest remainder.
    expect(
      orderChargedTotalOf({
        totalAmount: d("600.00"),
        installmentFeeAmount: d("39.83"),
      }).toFixed(2),
    ).toBe("639.83");
    expect(
      orderChargedTotalOf({
        totalAmount: d("400.00"),
        installmentFeeAmount: d("26.55"),
      }).toFixed(2),
    ).toBe("426.55");
  });

  it("is the goods total for a single payment or a legacy order", () => {
    expect(
      orderChargedTotalOf({
        totalAmount: d("837.50"),
        installmentFeeAmount: d("0"),
      }).toFixed(2),
    ).toBe("837.50");
  });
});

describe("refundGoodsPartOf", () => {
  it("takes the fee share out of the PSP refund amount", () => {
    // Plan 4.4: one item of 400.00 refunded, return_amount 426.55.
    expect(
      refundGoodsPartOf({
        amount: d("426.55"),
        installmentFeeAmount: d("26.55"),
      }).toFixed(2),
    ).toBe("400.00");
  });

  it("is the whole amount for a refund without a fee share", () => {
    expect(
      refundGoodsPartOf({
        amount: d("120.00"),
        installmentFeeAmount: d("0"),
      }).toFixed(2),
    ).toBe("120.00");
  });
});
