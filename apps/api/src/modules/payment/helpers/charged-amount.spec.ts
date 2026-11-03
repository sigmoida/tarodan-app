import { Prisma } from "@prisma/client";
import { chargedAmountOf } from "./charged-amount";

const d = (value: string) => new Prisma.Decimal(value);

describe("chargedAmountOf", () => {
  it("reads a legacy payment (no charged amount) as its goods total", () => {
    expect(
      chargedAmountOf({ amount: d("1000.00"), chargedAmount: null }).toFixed(2),
    ).toBe("1000.00");
  });

  it("reads an installment payment as the charged total C = T + F", () => {
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
