import { Prisma } from "@prisma/client";
import {
  allocateInstallmentFee,
  feeVatShareOf,
  keepGuardHolds,
  priceInstallment,
  singlePaymentPrice,
  type InstallmentPrice,
} from "./installment-pricing";
import { INSTALLMENT_FEE_VAT_RATE_PCT } from "./installment-config";

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * The worked examples of tarodan-ops plan 2026-11-03, section 4.4: a
 * 1,000.00 TL cart, r1 = 3%, r3 = 8%, r6 = 13% (illustrative rates). Every row
 * of the table is pinned, with the PayTR deduction round2(C x rn) and the
 * platform PSP net C - deduction - k x F the table also lists.
 */
const RATES: Record<number, string> = { 3: "8", 6: "13" };

function price(
  count: number,
  sharePct: string,
  vatPct: string,
): InstallmentPrice {
  return priceInstallment({
    baseAmount: D("1000.00"),
    count,
    singleRatePct: D("3"),
    installmentRatePct: D(RATES[count] ?? "3"),
    platformSharePct: D(sharePct),
    feeVatRatePct: D(vatPct),
  });
}

function pspFigures(p: InstallmentPrice, ratePct: string, vatPct: string) {
  const deduction = p.chargedAmount
    .times(D(ratePct).div(100))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const net = p.chargedAmount
    .minus(p.chargedAmount.times(D(ratePct).div(100)))
    .minus(feeVatShareOf(D(vatPct)).times(p.feeAmount))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { deduction: deduction.toFixed(2), net: net.toFixed(2) };
}

describe("installment pricing (plan 4.4 worked examples)", () => {
  it.each`
    case                | n    | share    | vat     | charged      | fee         | monthly      | deduction   | net         | cost
    ${"single"}         | ${1} | ${"0"}   | ${"20"} | ${"1000.00"} | ${"0.00"}   | ${"1000.00"} | ${"30.00"}  | ${"970.00"} | ${"0.00"}
    ${"default k=1/6"}  | ${3} | ${"0"}   | ${"20"} | ${"1066.38"} | ${"66.38"}  | ${"355.46"}  | ${"85.31"}  | ${"970.01"} | ${"0.00"}
    ${"default k=1/6"}  | ${6} | ${"0"}   | ${"20"} | ${"1142.22"} | ${"142.22"} | ${"190.37"}  | ${"148.49"} | ${"970.03"} | ${"0.00"}
    ${"default k=0"}    | ${3} | ${"0"}   | ${"0"}  | ${"1054.35"} | ${"54.35"}  | ${"351.45"}  | ${"84.35"}  | ${"970.00"} | ${"0.00"}
    ${"default k=0"}    | ${6} | ${"0"}   | ${"0"}  | ${"1114.98"} | ${"114.98"} | ${"185.83"}  | ${"144.95"} | ${"970.03"} | ${"0.00"}
    ${"rule 100%"}      | ${3} | ${"100"} | ${"20"} | ${"1000.00"} | ${"0.00"}   | ${"333.33"}  | ${"80.00"}  | ${"920.00"} | ${"50.00"}
    ${"rule 50% k=1/6"} | ${3} | ${"50"}  | ${"20"} | ${"1033.20"} | ${"33.20"}  | ${"344.40"}  | ${"82.66"}  | ${"945.01"} | ${"24.99"}
    ${"rule 50% k=1/6"} | ${6} | ${"50"}  | ${"20"} | ${"1071.12"} | ${"71.12"}  | ${"178.52"}  | ${"139.25"} | ${"920.02"} | ${"49.98"}
    ${"rule 50% k=0"}   | ${6} | ${"50"}  | ${"0"}  | ${"1057.50"} | ${"57.50"}  | ${"176.25"}  | ${"137.48"} | ${"920.03"} | ${"49.98"}
  `(
    "$case, n=$n: C $charged, F $fee, $n x $monthly, PayTR $deduction, net $net, P $cost",
    ({ n, share, vat, charged, fee, monthly, deduction, net, cost }) => {
      const p = price(n, share, vat);
      expect(p.count).toBe(n);
      expect(p.chargedAmount.toFixed(2)).toBe(charged);
      expect(p.feeAmount.toFixed(2)).toBe(fee);
      expect(p.monthlyAmount.toFixed(2)).toBe(monthly);
      expect(p.platformCostAmount.toFixed(2)).toBe(cost);
      expect(pspFigures(p, RATES[n] ?? "3", vat)).toEqual({ deduction, net });
    },
  );

  it("splits the 66.38 fee into 55.32 + 11.06 VAT at k = 1/6 (D4 invoice)", () => {
    const p = price(3, "0", "20");
    const vat = p.feeAmount
      .times(feeVatShareOf(INSTALLMENT_FEE_VAT_RATE_PCT))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    expect(vat.toFixed(2)).toBe("11.06");
    expect(p.feeAmount.minus(vat).toFixed(2)).toBe("55.32");
  });

  it("premium set-up: 3 x 333.33 at 100% and 6 x 178.52 at 50%; free tier pays 355.46 / 190.37", () => {
    expect(price(3, "100", "20").monthlyAmount.toFixed(2)).toBe("333.33");
    expect(price(6, "50", "20").monthlyAmount.toFixed(2)).toBe("178.52");
    expect(price(3, "0", "20").monthlyAmount.toFixed(2)).toBe("355.46");
    expect(price(6, "0", "20").monthlyAmount.toFixed(2)).toBe("190.37");
  });

  it("uses the configured VAT rate of the fee (AS-F1: 20%, k = 1/6)", () => {
    expect(INSTALLMENT_FEE_VAT_RATE_PCT.toString()).toBe("20");
    expect(feeVatShareOf(D(20)).times(6).toDecimalPlaces(12).toString()).toBe(
      "1",
    );
  });
});

describe("installment pricing rules", () => {
  const base = {
    baseAmount: D("1000.00"),
    singleRatePct: D("3"),
    platformSharePct: D("0"),
    feeVatRatePct: D("20"),
  };

  it("charges T with no fee when rn <= r1", () => {
    for (const rate of ["3", "2.5"]) {
      const p = priceInstallment({
        ...base,
        count: 3,
        installmentRatePct: D(rate),
      });
      expect(p.chargedAmount.toFixed(2)).toBe("1000.00");
      expect(p.feeAmount.toFixed(2)).toBe("0.00");
      expect(p.platformCostAmount.toFixed(2)).toBe("0.00");
    }
  });

  it("rounds C up to a multiple of n kuruş, so every installment is equal", () => {
    for (let n = 2; n <= 12; n += 1) {
      const p = priceInstallment({
        ...base,
        baseAmount: D("777.77"),
        count: n,
        installmentRatePct: D("4.37"),
      });
      const kurus = p.chargedAmount.times(100);
      expect(kurus.isInteger()).toBe(true);
      expect(kurus.mod(n).isZero()).toBe(true);
      expect(p.monthlyAmount.times(n).equals(p.chargedAmount)).toBe(true);
      expect(p.feeAmount.equals(p.chargedAmount.minus(D("777.77")))).toBe(true);
      // The buyer pays at most n - 1 kuruş more than the exact gross-up.
      expect(p.feeAmount.gt(0)).toBe(true);
    }
  });

  it("does not push an exact kuruş installment up by k = 1/6's last digit", () => {
    // Exact: 452 x (5 - 6 x 0.03) / (5 - 6 x 0.08) = 482.00, so 2 x 241.00.
    // In 20-digit Decimal arithmetic the quotient is 241.00000000000000001;
    // a bare ceiling would charge 482.02.
    const p = priceInstallment({
      ...base,
      baseAmount: D("452.00"),
      count: 2,
      installmentRatePct: D("8"),
    });
    expect(p.chargedAmount.toFixed(2)).toBe("482.00");
    expect(p.feeAmount.toFixed(2)).toBe("30.00");
    expect(p.monthlyAmount.toFixed(2)).toBe("241.00");
  });

  it("never charges below T and never reports a negative platform cost", () => {
    const p = priceInstallment({
      ...base,
      baseAmount: D("0.01"),
      count: 12,
      installmentRatePct: D("3.01"),
    });
    expect(p.chargedAmount.gte(D("0.01"))).toBe(true);
    expect(p.platformCostAmount.isNegative()).toBe(false);
  });

  it("treats count 1 as the single payment whatever the rates", () => {
    expect(
      priceInstallment({ ...base, count: 1, installmentRatePct: D("50") }),
    ).toEqual(singlePaymentPrice(D("1000.00")));
  });

  it.each`
    field                   | value
    ${"baseAmount"}         | ${D("0")}
    ${"baseAmount"}         | ${D("10.001")}
    ${"count"}              | ${0}
    ${"count"}              | ${13}
    ${"count"}              | ${2.5}
    ${"singleRatePct"}      | ${D("-1")}
    ${"installmentRatePct"} | ${D("100")}
    ${"platformSharePct"}   | ${D("100.01")}
    ${"feeVatRatePct"}      | ${D("-0.01")}
  `("refuses $field = $value", ({ field, value }) => {
    expect(() =>
      priceInstallment({
        ...base,
        count: 3,
        installmentRatePct: D("8"),
        [field]: value,
      }),
    ).toThrow(RangeError);
  });

  it("refuses rates that leave nothing to charge (1 - rn - k <= 0)", () => {
    expect(() =>
      priceInstallment({ ...base, count: 3, installmentRatePct: D("90") }),
    ).toThrow(RangeError);
  });
});

describe("allocateInstallmentFee (largest remainder)", () => {
  it("splits 66.38 over orders of 600.00 and 400.00 as 39.83 and 26.55 (plan 4.4)", () => {
    const shares = allocateInstallmentFee(D("66.38"), [
      D("600.00"),
      D("400.00"),
    ]);
    expect(shares.map((s) => s.toFixed(2))).toEqual(["39.83", "26.55"]);
  });

  it("gives the left-over kuruş to the largest remainder, not to the first order", () => {
    // 66.38 x 0.4 = 26.552 (remainder .2), 66.38 x 0.6 = 39.828 (remainder .8).
    expect(
      allocateInstallmentFee(D("66.38"), [D("400.00"), D("600.00")]).map((s) =>
        s.toFixed(2),
      ),
    ).toEqual(["26.55", "39.83"]);
    // 4 kuruş over 1 : 2 : 2 -> 0.8 / 1.6 / 1.6: floors 0 / 1 / 1, the two
    // kuruş left go to the .8 and then the earlier of the two .6.
    expect(
      allocateInstallmentFee(D("0.04"), [D("1"), D("2"), D("2")]).map((s) =>
        s.toFixed(2),
      ),
    ).toEqual(["0.01", "0.02", "0.01"]);
  });

  it("refuses a negative or sub-kuruş fee and negative weights", () => {
    expect(() => allocateInstallmentFee(D("-0.01"), [D("1")])).toThrow(
      RangeError,
    );
    expect(() => allocateInstallmentFee(D("1.001"), [D("1")])).toThrow(
      RangeError,
    );
    expect(() => allocateInstallmentFee(D("1.00"), [D("2"), D("-1")])).toThrow(
      RangeError,
    );
  });

  it("always sums to the fee exactly and gives ties to the earlier order", () => {
    const shares = allocateInstallmentFee(D("0.02"), [D("1"), D("1"), D("1")]);
    expect(shares.map((s) => s.toFixed(2))).toEqual(["0.01", "0.01", "0.00"]);
    const many = allocateInstallmentFee(D("100.01"), [
      D("33.33"),
      D("33.33"),
      D("33.34"),
      D("0.01"),
    ]);
    expect(many.reduce((a, b) => a.plus(b), D(0)).toFixed(2)).toBe("100.01");
  });

  it("gives a zero fee nothing and puts a fee without weights on the first order", () => {
    expect(
      allocateInstallmentFee(D("0"), [D("5"), D("6")]).map((s) => s.toFixed(2)),
    ).toEqual(["0.00", "0.00"]);
    expect(
      allocateInstallmentFee(D("1.00"), [D("0"), D("0")]).map((s) =>
        s.toFixed(2),
      ),
    ).toEqual(["1.00", "0.00"]);
    expect(allocateInstallmentFee(D("1.00"), [])).toEqual([]);
  });
});

describe("keepGuardHolds (AS-P5)", () => {
  it("holds for the worked example: one 1,000.00 order, seller amount 830.00, 3 installments", () => {
    const p = price(3, "0", "20");
    expect(
      keepGuardHolds(p, D("8"), [
        { totalAmount: D("1000.00"), sellerAmount: D("830.00") },
      ]),
    ).toBe(true);
  });

  it("fails when an order slice cannot cover PayTR's deduction at a 100% share", () => {
    // C = T = 1,000.00; deduction 13% = 130.00 > margin 1,000.00 - 900.00.
    const p = priceInstallment({
      baseAmount: D("1000.00"),
      count: 6,
      singleRatePct: D("3"),
      installmentRatePct: D("13"),
      platformSharePct: D("100"),
      feeVatRatePct: D("20"),
    });
    expect(
      keepGuardHolds(p, D("13"), [
        { totalAmount: D("1000.00"), sellerAmount: D("900.00") },
      ]),
    ).toBe(false);
    // The same count holds while the margin covers it exactly.
    expect(
      keepGuardHolds(p, D("13"), [
        { totalAmount: D("1000.00"), sellerAmount: D("870.00") },
      ]),
    ).toBe(true);
  });

  it("checks every slice with its allocated fee share", () => {
    const p = price(3, "0", "20"); // F = 66.38 -> 39.83 / 26.55
    const slices = [
      { totalAmount: D("600.00"), sellerAmount: D("500.00") },
      // 426.55 charged, 34.12 deduction: margin 426.55 - 392.44 = 34.11 < 34.12.
      { totalAmount: D("400.00"), sellerAmount: D("392.44") },
    ];
    expect(keepGuardHolds(p, D("8"), slices)).toBe(false);
    slices[1].sellerAmount = D("392.43");
    expect(keepGuardHolds(p, D("8"), slices)).toBe(true);
  });

  it("always holds for the single payment and without slices", () => {
    expect(keepGuardHolds(singlePaymentPrice(D("10")), D("50"), [])).toBe(true);
    expect(keepGuardHolds(price(3, "100", "20"), D("8"), [])).toBe(true);
  });
});
