import { Prisma } from "@prisma/client";
import { installmentMailLineOf } from "./installment-mail-line";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

describe("installmentMailLineOf", () => {
  it("states count, monthly, fee and total of a 3-installment payment (plan 4.4)", () => {
    expect(
      installmentMailLineOf({
        amount: D("1000.00"),
        chargedAmount: D("1066.38"),
        installmentCount: 3,
      }),
    ).toEqual({
      label: "Taksit",
      summary:
        "3 taksit: aylık 355,46 TL, vade farkı 66,38 TL, toplam 1.066,38 TL",
      chargedAmount: 1066.38,
    });
  });

  it("writes English for an English recipient", () => {
    expect(
      installmentMailLineOf(
        {
          amount: D("1000.00"),
          chargedAmount: D("1000.00"),
          installmentCount: 3,
        },
        "en",
      )?.summary,
    ).toBe(
      "3 installments: 333,33 TL per month, installment fee 0,00 TL, total 1.000,00 TL",
    );
  });

  it.each([1, 0])("writes nothing for a single payment (count %p)", (count) => {
    expect(
      installmentMailLineOf({
        amount: D("100.00"),
        chargedAmount: null,
        installmentCount: count,
      }),
    ).toBeNull();
  });
});
