import { Prisma } from "@prisma/client";
import { paymentInstallmentFieldsOf } from "./payment-installment-view";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

describe("paymentInstallmentFieldsOf", () => {
  it("shows a captured 3-installment payment with its card", () => {
    expect(
      paymentInstallmentFieldsOf({
        amount: D("1000.00"),
        chargedAmount: D("1066.38"),
        installmentCount: 3,
        chargeAttempt: { cardFamily: "world", cardBank: "Test Bank" },
      }),
    ).toEqual({
      installmentCount: 3,
      installmentFeeAmount: 66.38,
      chargedAmount: 1066.38,
      cardFamily: "world",
      cardBank: "Test Bank",
    });
  });

  it("shows a legacy or pending payment as a single payment of its amount", () => {
    expect(
      paymentInstallmentFieldsOf({
        amount: D("250.50"),
        chargedAmount: null,
        installmentCount: 1,
      }),
    ).toEqual({
      installmentCount: 1,
      installmentFeeAmount: 0,
      chargedAmount: 250.5,
    });
  });

  it("leaves the card out when the attempt has none (single payment)", () => {
    expect(
      paymentInstallmentFieldsOf({
        amount: D("100.00"),
        chargedAmount: D("100.00"),
        installmentCount: 1,
        chargeAttempt: { cardFamily: null, cardBank: null },
      }),
    ).not.toHaveProperty("cardFamily");
  });
});
